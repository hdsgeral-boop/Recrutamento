"use server";

import { pedirAoGemini, temChaveGemini } from "@/lib/analise/gemini";
import { extrairPrimeiroJson } from "@/lib/analise/fusao";
import { exigirEntrevistaDoCandidato, lerAtribuicao, registarHistorico } from "@/lib/entrevista/atribuicoes";
import { lerRoteiroEmVigor } from "@/lib/entrevista/carregar-roteiro";
import { classificarExperiencia, CRITERIO_EXPERIENCIA, perguntaServe } from "@/lib/entrevista/experiencia";
import { interpretarLeitura, instrucaoDeLeitura, type Leitura } from "@/lib/entrevista/leitura-ficha";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * ===========================================================================
 * LER A FOTOGRAFIA DA FICHA
 * ---------------------------------------------------------------------------
 * Recebe a imagem, pergunta ao modelo de visão que bolas estão preenchidas, e
 * devolve as marcações. Nada mais.
 *
 * O QUE ESTA ACÇÃO NÃO FAZ
 * Não grava. Não calcula a nota. Não fecha a entrevista. Devolve uma proposta
 * que aparece no ecrã do entrevistador com as marcações já postas, e é ele
 * que confirma e guarda - pelo mesmo caminho de sempre.
 *
 * A razão é simples: uma bola mal lida com confiança alta é indistinguível de
 * uma bem lida. A única defesa que funciona é obrigar alguém a olhar antes de
 * aquilo virar a nota de uma pessoa.
 * ===========================================================================
 */

const MAXIMO_BYTES = 6 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export interface ResultadoLeitura {
  ok: boolean;
  mensagem: string;
  leitura?: Leitura;
  /** Perguntas em vigor para este candidato, para o painel as casar. */
  versao?: string;
}

export async function lerFichaFotografada(dados: {
  candidatoId: string;
  /** A imagem em base64, sem o prefixo data:. */
  base64: string;
  tipo: string;
  bytes: number;
}): Promise<ResultadoLeitura> {
  try {
    await exigirEntrevistaDoCandidato(dados.candidatoId);
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  if (!TIPOS.includes(dados.tipo)) {
    return { ok: false, mensagem: "Manda uma fotografia (JPEG, PNG ou WebP)." };
  }

  if (dados.bytes > MAXIMO_BYTES) {
    return {
      ok: false,
      mensagem: "A fotografia é grande de mais. Tira-a com menos resolução, ou corta a folha.",
    };
  }

  if (!temChaveGemini()) {
    return {
      ok: false,
      mensagem:
        "Falta a chave do Gemini (GEMINI_API_KEY) para ler fichas. Até lá, marca as respostas à mão.",
    };
  }

  // As perguntas que valem para ESTE candidato: é contra elas que a leitura é
  // casada, e é o que se manda ao modelo como lista de códigos possíveis.
  const supabase = criarClienteServidor();

  const [roteiro, atribuicao, { data: candidatoData }, { data: analiseData }] = await Promise.all([
    lerRoteiroEmVigor(),
    lerAtribuicao(dados.candidatoId),
    supabase.from("candidatos").select("experiencia_similar").eq("id", dados.candidatoId).maybeSingle(),
    supabase
      .from("analises_candidato")
      .select("pontuacao_detalhe")
      .eq("candidato_id", dados.candidatoId)
      .eq("estado", "concluida")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const criterio = (
    analiseData as { pontuacao_detalhe?: { criterios?: { codigo: string; pontos: number; maximo: number }[] } } | null
  )?.pontuacao_detalhe?.criterios?.find((x) => x.codigo === CRITERIO_EXPERIENCIA);

  const experiencia = classificarExperiencia({
    manual: atribuicao?.grupo_manual ?? null,
    criterio: criterio ? { pontos: criterio.pontos, maximo: criterio.maximo } : null,
    declarou: (candidatoData as { experiencia_similar?: boolean | null } | null)?.experiencia_similar ?? null,
  });

  const perguntas = roteiro.perguntas.filter((p) => perguntaServe(p.grupo, experiencia.grupo));

  // ------------------------------------------------------------- O MODELO
  const resposta = await pedirAoGemini(
    instrucaoDeLeitura(perguntas),
    "Lê esta ficha de entrevista preenchida à mão e diz que círculo está preenchido em cada linha.",
    { base64: dados.base64, tipo: dados.tipo }
  );

  if (resposta.erro || !resposta.texto) {
    return { ok: false, mensagem: `A leitura falhou: ${resposta.erro ?? "o modelo não respondeu"}.` };
  }

  const json = extrairPrimeiroJson(resposta.texto);
  if (!json) {
    return { ok: false, mensagem: "A leitura devolveu algo que não é JSON. Tenta outra fotografia." };
  }

  let cru: unknown;
  try {
    cru = JSON.parse(json);
  } catch {
    return { ok: false, mensagem: "A leitura devolveu JSON partido. Tenta outra fotografia." };
  }

  const leitura = interpretarLeitura(cru as never, perguntas);

  if (leitura.vazia) {
    return {
      ok: false,
      mensagem: leitura.aviso ?? "Não consegui ler nenhuma linha desta folha.",
      leitura,
    };
  }

  await registarHistorico(
    dados.candidatoId,
    "leitura-automatica",
    "leu uma ficha em papel",
    `${leitura.linhas.length} linha(s), confiança ${Math.round(leitura.confiancaGlobal * 100)}%`
  );

  const duvidas = leitura.duvidosas.length;

  return {
    ok: true,
    versao: roteiro.versao,
    leitura,
    mensagem:
      duvidas > 0
        ? `Li ${leitura.linhas.length} linha(s). ${duvidas} precisa(m) que confirmes antes de guardar.`
        : `Li ${leitura.linhas.length} linha(s) com confiança. Confirma e guarda.`,
  };
}
