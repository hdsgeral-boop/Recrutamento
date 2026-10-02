"use server";

import { revalidatePath } from "next/cache";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigir } from "@/lib/utilizadores";

/**
 * ===========================================================================
 * MARCAÇÕES POR FASE
 * ---------------------------------------------------------------------------
 * A marcação em massa - toda a gente à mesma hora - saiu daqui, como já tinha
 * saído no projecto UGP: dava uma fila à porta. Quem marca agora é a Agenda
 * de Entrevistas (ver accoes-agenda.ts), que dá a cada pessoa a sua hora e a
 * sua sala.
 *
 * Ficou o que continua a servir: apagar uma marcação. Os emails já enviados
 * não se apagam nunca - ficam no histórico, porque o candidato recebeu-os.
 * ===========================================================================
 */

/** Apaga uma marcação. Não mexe no histórico de emails já enviados. */
export async function apagarEvento(id: string): Promise<{ ok: boolean; mensagem: string }> {
  try {
    await exigir("marcar_evento");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  const { error } = await criarClienteServidor().from("eventos_candidato").delete().eq("id", id);

  revalidatePath("/admin/comunicacoes");
  return error
    ? { ok: false, mensagem: error.message }
    : { ok: true, mensagem: "Marcação apagada. Os emails já enviados ficam no histórico." };
}
