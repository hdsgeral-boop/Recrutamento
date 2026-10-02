import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { arquivarNoDrive, type FicheiroParaDrive } from "@/lib/google-drive";
import { enviarEmailCandidato, enviarEmailRH } from "@/lib/email";
import { limparNomeFicheiro } from "@/lib/validacoes";
import { BUCKET } from "@/lib/constantes";
import type { Candidato } from "@/types/database";

/**
 * ===========================================================================
 * TAREFA DE FUNDO - arquivar no Drive e notificar por email
 * ---------------------------------------------------------------------------
 * Corre DEPOIS de o candidato já ter visto o ecrã "Candidatura Recebida".
 * O candidato nunca espera pelo Drive: os PDFs entram primeiro no Supabase
 * Storage (rápido) e só aqui é que sobem para o Google Drive.
 *
 * Regra de ouro: esta função NUNCA deita a aplicação abaixo. Qualquer falha
 * fica registada na coluna `arquivamento_erro` e pode ser repetida depois.
 * ===========================================================================
 */

/** Extensão a partir do tipo MIME, para dar nomes decentes aos ficheiros. */
function extensao(tipo: string, caminho: string): string {
  if (tipo === "application/pdf") return ".pdf";
  if (tipo === "image/png") return ".png";
  if (tipo === "image/jpeg") return ".jpg";
  const m = caminho.match(/(\.[a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : ".pdf";
}

/** Descarrega um ficheiro do Supabase Storage para memória. */
async function descarregar(caminho: string): Promise<{ conteudo: Buffer; tipo: string }> {
  const supabase = criarClienteServidor();
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho);

  if (error || !data) {
    throw new Error(`Não consegui ler "${caminho}" do Storage: ${error?.message ?? "sem dados"}`);
  }

  return {
    conteudo: Buffer.from(await data.arrayBuffer()),
    tipo: data.type || "application/pdf",
  };
}

/**
 * Processa uma candidatura: copia os 3 documentos para o Drive, guarda o link
 * e dispara os dois emails.
 */
export async function processarArquivamento(candidatoId: string): Promise<void> {
  const supabase = criarClienteServidor();

  const { data, error } = await supabase
    .from("candidatos")
    .select("*")
    .eq("id", candidatoId)
    .single();

  if (error || !data) {
    console.error("[arquivamento] candidato não encontrado:", candidatoId, error?.message);
    return;
  }

  const candidato = data as Candidato;
  const base = `${limparNomeFicheiro(candidato.nome)}_${limparNomeFicheiro(candidato.bi)}`;

  let pastaUrl: string | null = candidato.drive_folder_url;
  let erroDrive: string | null = null;

  // ---------------------------------------------------------------- 1. DRIVE
  try {
    const fontes: { rotulo: string; caminho: string | null }[] = [
      { rotulo: "CV", caminho: candidato.cv_url },
      { rotulo: "BI", caminho: candidato.bi_url },
      { rotulo: "Certificado", caminho: candidato.certificado_url },
      { rotulo: "Experiencia", caminho: candidato.experiencia_url },
    ];

    const ficheiros: FicheiroParaDrive[] = [];

    for (const fonte of fontes) {
      if (!fonte.caminho) continue;
      const { conteudo, tipo } = await descarregar(fonte.caminho);
      ficheiros.push({
        nome: `${fonte.rotulo}_${base}${extensao(tipo, fonte.caminho)}`,
        tipo,
        conteudo,
      });
    }

    if (ficheiros.length === 0) throw new Error("Nenhum documento associado à candidatura.");

    const resultado = await arquivarNoDrive(candidato.nome, candidato.bi, ficheiros);
    pastaUrl = resultado.pastaUrl;

    await supabase
      .from("candidatos")
      .update({
        drive_folder_url: pastaUrl,
        drive_folder_id: resultado.pastaId,
        arquivamento_estado: "concluido",
        arquivamento_erro: null,
      })
      .eq("id", candidato.id);
  } catch (erro) {
    erroDrive = erro instanceof Error ? erro.message : String(erro);
    console.error("[arquivamento] falha no Google Drive:", erroDrive);

    await supabase
      .from("candidatos")
      .update({ arquivamento_estado: "erro", arquivamento_erro: erroDrive.slice(0, 500) })
      .eq("id", candidato.id);
  }

  // ---------------------------------------------------------------- 2. EMAILS
  // Enviados mesmo que o Drive tenha falhado: o RH não pode ficar sem saber
  // que entrou uma candidatura.
  const comPasta = { ...candidato, drive_folder_url: pastaUrl };
  const emails = await Promise.allSettled([
    enviarEmailCandidato(comPasta),
    enviarEmailRH(comPasta, pastaUrl),
  ]);

  emails.forEach((r, i) => {
    const quem = i === 0 ? "candidato" : "RH";
    if (r.status === "rejected") console.error(`[arquivamento] email ${quem} rebentou:`, r.reason);
    else if (!r.value.ok) console.error(`[arquivamento] email ${quem} não saiu:`, r.value.erro);
  });

  // ------------------------------------------------------------- 3. ANÁLISE
  // Só depois do Drive, porque o OCR precisa dos ficheiros lá.
  // Se rebentar, a candidatura não é afectada: fica para a rota de recuperação.
  if (!erroDrive) {
    try {
      const { processarCandidato } = await import("@/lib/analise/processar");
      await processarCandidato(candidato.id);
    } catch (erro) {
      console.error("[arquivamento] a análise falhou:", erro);
    }
  }
}

/**
 * Repete o arquivamento de todas as candidaturas que ficaram por concluir.
 * Pode ser chamada manualmente pelo painel ou por um Cron Job da Vercel.
 */
export async function repetirPendentes(limite = 10): Promise<{ tratados: number }> {
  const supabase = criarClienteServidor();

  const { data } = await supabase
    .from("candidatos")
    .select("id")
    .neq("arquivamento_estado", "concluido")
    .order("created_at", { ascending: true })
    .limit(limite);

  const ids = (data ?? []).map((r) => r.id as string);

  for (const id of ids) {
    await processarArquivamento(id);
  }

  return { tratados: ids.length };
}
