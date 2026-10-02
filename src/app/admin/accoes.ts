"use server";

import { revalidatePath } from "next/cache";
import { exigir } from "@/lib/utilizadores";
import { waitUntil } from "@vercel/functions";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { processarArquivamento } from "@/lib/arquivamento";
import { esquemaMudancaStatus } from "@/lib/validacoes";
import { lerConfiguracaoFunil } from "@/lib/funil/carregar";
import { BUCKET } from "@/lib/constantes";
import type { Status } from "@/lib/constantes";

/**
 * ===========================================================================
 * SERVER ACTIONS DO PAINEL ADMIN
 * Todas correm atrás do middleware, logo já há sessão válida.
 * ===========================================================================
 */

export interface Resposta {
  ok: boolean;
  mensagem?: string;
}

/** Muda o estado de uma candidatura (Pendente / Aprovado / Reprovado / Contactado). */
export async function mudarStatus(
  id: string,
  status: Status,
  observacoes?: string
): Promise<Resposta> {
  // Permissão: só quem tem "editar_candidatura" chega aqui, venha o pedido de onde vier.
  try {
    await exigir("editar_candidatura");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  const validado = esquemaMudancaStatus.safeParse({ id, status, observacoes });

  if (!validado.success) {
    return { ok: false, mensagem: validado.error.errors[0]?.message ?? "Dados inválidos." };
  }

  // O estado tem de ser um dos que estão configurados em Definições - ou um
  // dos nomes antigos que continuam a contar, para uma ficha gravada há um mês
  // se poder voltar a gravar sem mudar de estado à socapa.
  const config = await lerConfiguracaoFunil();
  const permitidos = new Set<string>();
  for (const e of config.estados) {
    if (!e.activo) continue;
    permitidos.add(e.chave);
    permitidos.add(e.nome);
    for (const a of e.aliases) permitidos.add(a);
  }

  if (!permitidos.has(validado.data.status)) {
    return {
      ok: false,
      mensagem: `"${validado.data.status}" não é um estado configurado. Vê a lista em Definições.`,
    };
  }

  try {
    const supabase = criarClienteServidor();

    const { error } = await supabase
      .from("candidatos")
      .update({
        status: validado.data.status,
        observacoes: validado.data.observacoes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", validado.data.id);

    if (error) throw new Error(error.message);

    revalidatePath("/admin");
    revalidatePath(`/admin/candidato/${id}`);

    return { ok: true, mensagem: `Estado alterado para "${status}".` };
  } catch (erro) {
    console.error("[admin] erro ao mudar estado:", erro);
    return { ok: false, mensagem: "Não foi possível gravar a alteração." };
  }
}

export interface Documento {
  chave: string;
  etiqueta: string;
  caminho: string;
  nomeFicheiro: string;
  extensao: string;
  tamanho: number | null;
  urlVer: string;
  urlBaixar: string;
}

/**
 * Gera links temporários (1 hora) para os documentos guardados no Storage.
 * Devolve dois links por documento: um para abrir no browser e outro que
 * força a descarga. Usado na ficha do candidato e no botão "Baixar todos".
 */
export async function obterLinksDocumentos(
  id: string
): Promise<{ ok: boolean; documentos: Documento[]; mensagem?: string }> {
  try {
    const supabase = criarClienteServidor();

    const { data, error } = await supabase
      .from("candidatos")
      .select("nome, bi, cv_url, bi_url, certificado_url, experiencia_url")
      .eq("id", id)
      .single();

    if (error || !data) throw new Error(error?.message ?? "Candidato não encontrado.");

    const fontes = [
      { chave: "cv", etiqueta: "Curriculum Vitae", caminho: data.cv_url as string | null },
      { chave: "bi", etiqueta: "Bilhete de Identidade", caminho: data.bi_url as string | null },
      {
        chave: "certificado",
        etiqueta: "Certificado de Habilitações",
        caminho: data.certificado_url as string | null,
      },
      {
        chave: "experiencia",
        etiqueta: "Comprovativo de experiência",
        caminho: data.experiencia_url as string | null,
      },
    ].filter((f) => Boolean(f.caminho));

    const documentos: Documento[] = [];

    for (const fonte of fontes) {
      const caminho = fonte.caminho!;

      // Dois links: um abre no separador, o outro descarrega.
      const [ver, baixar] = await Promise.all([
        supabase.storage.from(BUCKET).createSignedUrl(caminho, 3600),
        supabase.storage.from(BUCKET).createSignedUrl(caminho, 3600, { download: true }),
      ]);

      if (!ver.data?.signedUrl || !baixar.data?.signedUrl) continue;

      // Tamanho do ficheiro, para o RH saber o que vai abrir.
      const pasta = caminho.split("/").slice(0, -1).join("/");
      const nome = caminho.split("/").pop() ?? caminho;
      const { data: listagem } = await supabase.storage.from(BUCKET).list(pasta, { limit: 100 });
      const meta = listagem?.find((o) => o.name === nome);

      documentos.push({
        chave: fonte.chave,
        etiqueta: fonte.etiqueta,
        caminho,
        nomeFicheiro: nome,
        extensao: (nome.split(".").pop() ?? "").toLowerCase(),
        tamanho: (meta?.metadata as { size?: number } | undefined)?.size ?? null,
        urlVer: ver.data.signedUrl,
        urlBaixar: baixar.data.signedUrl,
      });
    }

    if (documentos.length === 0) {
      return {
        ok: false,
        documentos: [],
        mensagem: "Não há documentos guardados para este candidato.",
      };
    }

    return { ok: true, documentos };
  } catch (erro) {
    console.error("[admin] erro ao gerar links:", erro);
    return { ok: false, documentos: [], mensagem: "Não foi possível preparar os documentos." };
  }
}

/** Repete o arquivamento no Drive e o envio dos emails de uma candidatura. */
export async function reprocessarArquivamento(id: string): Promise<Resposta> {
  // Permissão: só quem tem "editar_candidatura" chega aqui, venha o pedido de onde vier.
  try {
    await exigir("editar_candidatura");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  try {
    waitUntil(
      processarArquivamento(id).catch((erro) => console.error("[admin] reprocessamento:", erro))
    );
    revalidatePath(`/admin/candidato/${id}`);
    return { ok: true, mensagem: "Arquivamento reiniciado. Actualiza a página dentro de instantes." };
  } catch {
    return { ok: false, mensagem: "Não foi possível reiniciar o arquivamento." };
  }
}
