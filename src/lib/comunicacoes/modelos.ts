import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { TipoEmail } from "@/types/database";

export interface ModeloEmailDados {
  id?: string;
  concursoId: string;
  tipo: TipoEmail | string;
  assunto: string;
  corpoHtml: string;
  corpoTexto?: string | null;
}

/**
 * Lê o modelo de email configurado para um concurso.
 * Devolve null se a tabela ainda não existir ou se o concurso usar o modelo de omissão do código.
 */
export async function obterModeloEmail(
  concursoId: string,
  tipo: TipoEmail | string
): Promise<ModeloEmailDados | null> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .from("modelos_email")
      .select("id, concurso_id, tipo, assunto, corpo_html, corpo_texto")
      .eq("concurso_id", concursoId)
      .eq("tipo", tipo)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      concursoId: data.concurso_id,
      tipo: data.tipo,
      assunto: data.assunto,
      corpoHtml: data.corpo_html,
      corpoTexto: data.corpo_texto,
    };
  } catch {
    return null;
  }
}

/**
 * Grava ou actualiza o modelo de email de um concurso específico.
 */
export async function gravarModeloEmail(
  concursoId: string,
  tipo: TipoEmail | string,
  assunto: string,
  corpoHtml: string,
  corpoTexto?: string | null,
  actualizadoPor?: string
): Promise<{ ok: boolean; erro?: string }> {
  try {
    const supabase = criarClienteServidor();
    const { error } = await supabase
      .from("modelos_email")
      .upsert(
        {
          concurso_id: concursoId,
          tipo,
          assunto,
          corpo_html: corpoHtml,
          corpo_texto: corpoTexto ?? null,
          actualizado_em: new Date().toISOString(),
          actualizado_por: actualizadoPor ?? null,
        },
        { onConflict: "concurso_id,tipo" }
      );

    if (error) {
      return { ok: false, erro: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
