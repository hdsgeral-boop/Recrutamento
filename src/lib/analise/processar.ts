import "server-only";
import { createHash } from "node:crypto";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { obterTextoComCache, tipoPeloNome, type TextoDocumento } from "@/lib/analise/ocr-drive";
import { extrairFactos } from "@/lib/analise/extrair";
import { obterRubrica } from "@/lib/ranking/registo-rubricas";
import { versaoMotor } from "@/lib/analise/versao";
import type { Alerta, DadosFormulario } from "@/lib/ranking/tipos";
import { BUCKET } from "@/lib/constantes";
import type { Candidato } from "@/types/database";

const VERSAO_RUBRICA_PADRAO = "padrao-v1";

/**
 * ===========================================================================
 * ORQUESTRAÇÃO DA ANÁLISE
 * ---------------------------------------------------------------------------
 * Sequência: reunir ficheiros, calcular hashes, OCR com cache, extracção,
 * pontuação, gravação.
 *
 * Idempotência: `hash_documentos` é o sha256 da lista ordenada dos hashes de
 * cada anexo. Se os anexos não mudaram e a rubrica é a mesma, a restrição
 * UNIQUE bloqueia o reprocessamento e não se gasta nem OCR nem tokens.
 * ===========================================================================
 */

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

interface Anexo {
  chave: "cv" | "bi" | "certificado" | "experiencia";
  caminho: string;
  hash: string;
  driveFileId: string | null;
  nomeFicheiro: string;
}

/** Descarrega os anexos do Storage e calcula o hash de cada um. */
async function reunirAnexos(c: Candidato): Promise<{ anexos: Anexo[]; alertas: Alerta[] }> {
  const supabase = criarClienteServidor();
  const alertas: Alerta[] = [];
  const anexos: Anexo[] = [];

  const fontes: { chave: Anexo["chave"]; caminho: string | null }[] = [
    { chave: "cv", caminho: c.cv_url },
    { chave: "bi", caminho: c.bi_url },
    { chave: "certificado", caminho: c.certificado_url },
    { chave: "experiencia", caminho: c.experiencia_url },
  ];

  const vistos = new Map<string, string>(); // hash -> chave

  for (const f of fontes) {
    if (!f.caminho) continue;

    const { data, error } = await supabase.storage.from(BUCKET).download(f.caminho);
    if (error || !data) {
      alertas.push({
        tipo: "documento_ilegivel",
        mensagem: `Não consegui ler o ficheiro do ${f.chave} no Storage.`,
        gravidade: "aviso",
      });
      continue;
    }

    const hash = sha256(Buffer.from(await data.arrayBuffer()));

    // Um candidato que carrega o mesmo PDF como CV e como comprovativo não
    // entregou comprovativo nenhum. Três linhas, sem IA.
    const anterior = vistos.get(hash);
    if (anterior) {
      alertas.push({
        tipo: "ficheiro_duplicado",
        mensagem: `O ficheiro do ${f.chave} é igual ao do ${anterior}. Falta um documento verdadeiro.`,
        gravidade: "grave",
      });
      continue;
    }
    vistos.set(hash, f.chave);

    anexos.push({
      chave: f.chave,
      caminho: f.caminho,
      hash,
      driveFileId: null,
      nomeFicheiro: f.caminho.split("/").pop() ?? f.caminho,
    });
  }

  return { anexos, alertas };
}

/**
 * Liga cada anexo ao ficheiro correspondente no Drive, para o OCR.
 *
 * As candidaturas anteriores à migração do ranking não têm drive_folder_id
 * gravado, mas os ficheiros estão lá na mesma. Nesse caso procuramos a pasta
 * pelo nome e pelo BI e gravamos o ID, para a próxima análise ser directa.
 */
async function ligarAoDrive(c: Candidato, anexos: Anexo[]): Promise<string | null> {
  let pastaId = c.drive_folder_id ?? null;

  if (!pastaId) {
    const { encontrarPastaDoCandidato } = await import("@/lib/google-drive");
    pastaId = await encontrarPastaDoCandidato(c.nome, c.bi);

    if (pastaId) {
      // Escrita puramente aditiva: só preenche uma coluna que estava vazia.
      await criarClienteServidor()
        .from("candidatos")
        .update({ drive_folder_id: pastaId })
        .eq("id", c.id)
        .is("drive_folder_id", null);
    }
  }

  if (!pastaId) return null;

  try {
    const { obterDrive } = await import("@/lib/google-drive");
    const drive = obterDrive();
    const lista = await drive.files.list({
      q: `'${pastaId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType)",
      pageSize: 20,
    });

    for (const ficheiro of lista.data.files ?? []) {
      const tipo = tipoPeloNome(ficheiro.name ?? "");
      const alvo = anexos.find((a) => a.chave === tipo && !a.driveFileId);
      if (alvo && ficheiro.id) {
        alvo.driveFileId = ficheiro.id;
        alvo.nomeFicheiro = ficheiro.name ?? alvo.nomeFicheiro;
      }
    }
  } catch (erro) {
    console.error("[analise] não consegui listar a pasta do Drive:", erro);
  }

  return pastaId;
}

function dadosDoFormulario(c: Candidato): DadosFormulario {
  return {
    provincia: c.provincia,
    municipio: c.municipio,
    tem_carta: c.tem_carta,
    conhece_mtbt: c.conhece_mtbt,
    experiencia_similar: c.experiencia_similar,
    nivel_academico: c.nivel_academico,
    curso: c.curso,
    temCv: Boolean(c.cv_url),
    temBi: Boolean(c.bi_url),
    temCertificado: Boolean(c.certificado_url),
    temComprovativoExperiencia: Boolean(c.experiencia_url),
  };
}

export interface ResultadoProcessamento {
  ok: boolean;
  mensagem: string;
  total?: number;
  reaproveitada?: boolean;
}

/**
 * Analisa um candidato de ponta a ponta.
 * `forcar` ignora a cache do hash e refaz tudo, incluindo o OCR.
 */
export async function processarCandidato(
  candidatoId: string,
  forcar = false
): Promise<ResultadoProcessamento> {
  const supabase = criarClienteServidor();

  const { data } = await supabase.from("candidatos").select("*").eq("id", candidatoId).maybeSingle();
  if (!data) return { ok: false, mensagem: "Candidato não encontrado." };

  const candidato = data as Candidato;

  // Descobrir a versão da rúbrica associada ao concurso deste candidato
  let versaoRubrica = VERSAO_RUBRICA_PADRAO;
  if (candidato.concurso_id) {
    const { data: conc } = await supabase
      .from("concursos")
      .select("rubrica_versao")
      .eq("id", candidato.concurso_id)
      .maybeSingle();
    if (conc?.rubrica_versao) {
      versaoRubrica = conc.rubrica_versao;
    }
  }
  const rubrica = obterRubrica(versaoRubrica);

  // ------------------------------------------------------------ 1. ANEXOS
  const { anexos, alertas } = await reunirAnexos(candidato);
  const pastaDrive = await ligarAoDrive(candidato, anexos);

  // A versão do motor entra no hash: melhorar a leitura invalida as análises
  // antigas sem lhes tocar, e o painel passa a oferecer refazê-las.
  const impressao = anexos.map((a) => a.hash).sort().join("|") || "sem-anexos";
  const hashDocumentos = sha256(`${versaoMotor()}|${impressao}`);

  // -------------------------------------------------------- 2. JÁ EXISTE?
  if (!forcar) {
    const { data: existente } = await supabase
      .from("analises_candidato")
      .select("id, pontuacao_total, estado")
      .eq("candidato_id", candidatoId)
      .eq("versao_rubrica", versaoRubrica)
      .eq("hash_documentos", hashDocumentos)
      .eq("estado", "concluida")
      .maybeSingle();

    if (existente) {
      return {
        ok: true,
        reaproveitada: true,
        total: Number(existente.pontuacao_total),
        mensagem: "Os anexos não mudaram: a análise anterior continua válida.",
      };
    }
  }

  // ------------------------------------------------------ 3. RESERVAR
  const { data: reserva } = await supabase
    .from("analises_candidato")
    .upsert(
      {
        candidato_id: candidatoId,
        versao_rubrica: versaoRubrica,
        hash_documentos: hashDocumentos,
        estado: "a_processar",
      },
      { onConflict: "candidato_id,versao_rubrica,hash_documentos" }
    )
    .select("id, tentativas")
    .single();

  const analiseId = reserva?.id as string | undefined;

  try {
    // ------------------------------------------------------------ 4. OCR
    const textos: TextoDocumento[] = [];

    for (const anexo of anexos) {
      // Sem ficheiro no Drive não há o que ler. Também não é alerta: o
      // documento está guardado em segurança no Supabase e o problema, a
      // existir, é do arquivamento, que tem o seu próprio aviso no painel.
      if (!anexo.driveFileId) continue;

      const t = await obterTextoComCache(
        candidatoId,
        anexo.driveFileId,
        anexo.nomeFicheiro,
        anexo.hash,
        forcar
      );
      textos.push(t);

      // Um documento que o OCR não conseguiu ler NÃO gera alerta. A falha é
      // da leitura automática, não da candidatura, e encher a ficha de avisos
      // por causa de uma fotografia tremida só faz o RH desconfiar de quem
      // não tem culpa nenhuma. Fica registado em documentos_texto para quem
      // quiser investigar.
    }

    // ------------------------------------------ 4b. TEXTO JÁ GUARDADO
    // Se o Drive não respondeu - quota, avaria, credenciais trocadas - mas o
    // OCR já correu numa análise anterior, o texto está em documentos_texto e
    // serve na mesma. É também isto que faz com que refazer as análises
    // depois de melhorar o motor de leitura seja quase instantâneo: o OCR
    // não se repete.
    const jaLidos = new Set(textos.map((t) => t.driveFileId));

    const { data: guardados } = await supabase
      .from("documentos_texto")
      .select("drive_file_id, tipo_documento, nome_ficheiro, texto, erro")
      .eq("candidato_id", candidatoId);

    for (const linha of guardados ?? []) {
      const id = linha.drive_file_id as string;
      if (jaLidos.has(id)) continue;

      const texto = (linha.texto as string) ?? "";
      if (!texto) continue;

      textos.push({
        driveFileId: id,
        tipo: linha.tipo_documento as TextoDocumento["tipo"],
        nomeFicheiro: linha.nome_ficheiro as string,
        texto,
        legivel: texto.length >= 120,
        erro: (linha.erro as string) ?? null,
      });
    }

    // ------------------------------------------------------ 5. EXTRACÇÃO
    const resultado = await extrairFactos(textos);

    if (resultado.erro) {
      alertas.push({
        tipo: "sem_extraccao",
        mensagem: resultado.erro,
        gravidade: "aviso",
      });
    }

    // Deixar escrito com que motor a análise foi feita. Quando alguém
    // contestar uma posição no ranking, isto é a primeira coisa a saber.
    if (textos.length > 0) {
      const caracteres = textos.reduce((s, t) => s + t.texto.length, 0);
      alertas.push({
        tipo: "sem_extraccao",
        mensagem:
          resultado.modelo === "heuristico"
            ? `Leitura por OCR do Drive (${caracteres} caracteres em ${textos.length} documento(s)) e extractor determinístico. Sem modelo de linguagem configurado.`
            : `Leitura por OCR do Drive (${caracteres} caracteres em ${textos.length} documento(s)) interpretada por ${resultado.modelo}.`,
        gravidade: "info",
      });
    }

    // ------------------------------------------------------ 6. PONTUAÇÃO
    const pontuacao = rubrica.calcularPontuacao(dadosDoFormulario(candidato), resultado.extraccao);
    const todosAlertas = [...alertas, ...pontuacao.alertas];

    // -------------------------------------------------------- 7. GRAVAR
    await supabase
      .from("analises_candidato")
      .update({
        pontuacao_total: pontuacao.total,
        pontuacao_detalhe: { ...pontuacao, motor: versaoMotor() } as unknown as Record<string, unknown>,
        extraccao: resultado.bruto
          ? ({ json: resultado.extraccao, bruto: resultado.bruto } as unknown as Record<string, unknown>)
          : ({ json: resultado.extraccao } as unknown as Record<string, unknown>),
        alertas: todosAlertas as unknown as Record<string, unknown>[],
        eliminado: pontuacao.eliminado,
        motivo_eliminacao: pontuacao.motivoEliminacao,
        modelo: resultado.modelo,
        tokens_entrada: resultado.tokensEntrada,
        tokens_saida: resultado.tokensSaida,
        estado: "concluida",
        erro: null,
        actualizado_em: new Date().toISOString(),
      })
      .eq("id", analiseId);

    return {
      ok: true,
      total: pontuacao.total,
      mensagem: pontuacao.eliminado
        ? `Eliminado: ${pontuacao.motivoEliminacao}`
        : `Analisado: ${pontuacao.total} pontos em ${rubrica.totalMaximo}.`,
    };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    console.error("[analise] falhou:", msg);

    if (analiseId) {
      await supabase
        .from("analises_candidato")
        .update({
          estado: "erro",
          erro: msg.slice(0, 500),
          tentativas: ((reserva?.tentativas as number) ?? 0) + 1,
          actualizado_em: new Date().toISOString(),
        })
        .eq("id", analiseId);
    }

    return { ok: false, mensagem: `A análise falhou: ${msg.slice(0, 150)}` };
  }
}

/**
 * Apanha as análises que ficaram por concluir.
 * Processa no máximo 3 em paralelo, para não estourar o tempo de execução.
 */
export async function processarPendentes(limite = 6): Promise<{ tratados: number; resultados: string[] }> {
  const supabase = criarClienteServidor();
  const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString();

  const { data } = await supabase
    .from("analises_candidato")
    .select("candidato_id, estado, actualizado_em, tentativas")
    .in("estado", ["pendente", "erro", "a_processar"])
    .lt("tentativas", 3)
    .lt("actualizado_em", umaHoraAtras)
    .limit(limite);

  const ids = Array.from(new Set((data ?? []).map((r) => r.candidato_id as string)));
  const resultados: string[] = [];

  // Lotes de 3, para não passar do tempo de execução da função.
  for (let i = 0; i < ids.length; i += 3) {
    const lote = ids.slice(i, i + 3);
    const r = await Promise.allSettled(lote.map((id) => processarCandidato(id)));
    r.forEach((x, j) =>
      resultados.push(
        x.status === "fulfilled" ? `${lote[j]}: ${x.value.mensagem}` : `${lote[j]}: rebentou`
      )
    );
  }

  return { tratados: ids.length, resultados };
}

/** Cria a linha pendente logo após a submissão, para nada se perder. */
export async function marcarParaAnalise(candidatoId: string): Promise<void> {
  try {
    const supabase = criarClienteServidor();
    let versaoRubrica = VERSAO_RUBRICA_PADRAO;
    const { data: cand } = await supabase
      .from("candidatos")
      .select("concurso_id")
      .eq("id", candidatoId)
      .maybeSingle();

    if (cand?.concurso_id) {
      const { data: conc } = await supabase
        .from("concursos")
        .select("rubrica_versao")
        .eq("id", cand.concurso_id)
        .maybeSingle();
      if (conc?.rubrica_versao) {
        versaoRubrica = conc.rubrica_versao;
      }
    }

    await supabase
      .from("analises_candidato")
      .upsert(
        {
          candidato_id: candidatoId,
          versao_rubrica: versaoRubrica,
          hash_documentos: "por-calcular",
          estado: "pendente",
        },
        { onConflict: "candidato_id,versao_rubrica,hash_documentos", ignoreDuplicates: true }
      );
  } catch (erro) {
    console.error("[analise] não consegui marcar para análise:", erro);
  }
}
