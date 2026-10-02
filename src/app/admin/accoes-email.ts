"use server";

import { revalidatePath } from "next/cache";
import { exigir } from "@/lib/utilizadores";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { dataFutura } from "@/lib/entrevista/quando";
import {
  enviarEmailAprovacao,
  enviarEmailCandidato,
  enviarEmailEntrevista,
  enviarEmailPersonalizado,
  enviarEmailReprovacao,
} from "@/lib/email";
import type { Candidato } from "@/types/database";

/**
 * ===========================================================================
 * COMUNICAÇÕES COM O CANDIDATO
 * ---------------------------------------------------------------------------
 * Correm atrás do middleware, logo já há sessão do painel.
 * Cada envio fica registado em emails_enviados, com sucesso ou com erro.
 * ===========================================================================
 */

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

async function buscar(id: string): Promise<Candidato | null> {
  const { data } = await criarClienteServidor()
    .from("candidatos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Candidato) ?? null;
}

function refrescar(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/comunicacoes");
  revalidatePath(`/admin/candidato/${id}`);
}

const esquemaEntrevista = z.object({
  id: z.string().uuid(),
  data: z.string().min(1, "Escolhe a data."),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida."),
  local: z.string().trim().min(3, "Indica onde é a entrevista."),
  notas: z.string().trim().max(1500).optional(),
  enviarEmail: z.boolean(),
  aprovar: z.boolean(),
});

export type DadosAgendamento = z.infer<typeof esquemaEntrevista>;

/**
 * Marca (ou remarca) a entrevista e, se pedido, avisa o candidato.
 * Quando é a primeira marcação, o email é o de aprovação; nas seguintes é o
 * de remarcação, para o candidato perceber que a data anterior caiu.
 */
export async function agendarEntrevista(dados: DadosAgendamento): Promise<Resultado> {
  // Permissão: só quem tem "marcar_evento" chega aqui, venha o pedido de onde vier.
  try {
    await exigir("marcar_evento");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  const validado = esquemaEntrevista.safeParse(dados);
  if (!validado.success) {
    return { ok: false, mensagem: validado.error.errors[0]?.message ?? "Dados inválidos." };
  }

  const d = validado.data;

  try {
    const candidato = await buscar(d.id);
    if (!candidato) return { ok: false, mensagem: "Candidato não encontrado." };

    // A hora escrita no painel é hora de Angola (UTC+1).
    const quando = new Date(`${d.data}T${d.hora}:00+01:00`);

    // Marcar para o passado manda um email a convocar alguém para um dia que
    // já foi, e deixa a marcação no painel como se estivesse de pé.
    const veredicto = dataFutura(quando.toISOString());
    if (!veredicto.ok) {
      return { ok: false, mensagem: veredicto.erro! };
    }

    if (Number.isNaN(quando.getTime())) {
      return { ok: false, mensagem: "Data ou hora inválida." };
    }

    const remarcacao = Boolean(candidato.entrevista_em);
    const supabase = criarClienteServidor();

    const { error } = await supabase
      .from("candidatos")
      .update({
        entrevista_em: quando.toISOString(),
        entrevista_local: d.local,
        entrevista_notas: d.notas?.trim() || null,
        ...(d.aprovar ? { status: "Aprovado" } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", d.id);

    if (error) throw new Error(error.message);

    let aviso = "";
    if (d.enviarEmail) {
      const entrevista = { quando: quando.toISOString(), local: d.local, notas: d.notas };
      const r = remarcacao
        ? await enviarEmailEntrevista({ ...candidato }, entrevista, "remarcada", "painel")
        : await enviarEmailAprovacao({ ...candidato }, entrevista, "painel");

      aviso = r.ok
        ? ` Email enviado para ${candidato.email}.`
        : ` Mas o email não saiu: ${r.erro?.slice(0, 90)}`;
    }

    refrescar(d.id);

    return {
      ok: true,
      mensagem: `${remarcacao ? "Entrevista remarcada" : "Entrevista marcada"}.${aviso}`,
    };
  } catch (erro) {
    console.error("[comunicacoes] agendar:", erro);
    return { ok: false, mensagem: "Não foi possível marcar a entrevista." };
  }
}

/** Desmarca a entrevista, sem avisar ninguém automaticamente. */
export async function desmarcarEntrevista(id: string): Promise<Resultado> {
  // Permissão: só quem tem "marcar_evento" chega aqui, venha o pedido de onde vier.
  try {
    await exigir("marcar_evento");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  try {
    const { error } = await criarClienteServidor()
      .from("candidatos")
      .update({ entrevista_em: null, entrevista_local: null, entrevista_notas: null })
      .eq("id", id);
    if (error) throw new Error(error.message);
    refrescar(id);
    return { ok: true, mensagem: "Entrevista desmarcada. O candidato não foi avisado." };
  } catch {
    return { ok: false, mensagem: "Não foi possível desmarcar." };
  }
}

/** Reenvia o lembrete da entrevista já marcada. */
export async function enviarLembrete(id: string): Promise<Resultado> {
  // Permissão: só quem tem "enviar_email" chega aqui, venha o pedido de onde vier.
  try {
    await exigir("enviar_email");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  try {
    const c = await buscar(id);
    if (!c) return { ok: false, mensagem: "Candidato não encontrado." };
    if (!c.entrevista_em || !c.entrevista_local) {
      return { ok: false, mensagem: "Este candidato não tem entrevista marcada." };
    }

    const r = await enviarEmailEntrevista(
      c,
      { quando: c.entrevista_em, local: c.entrevista_local, notas: c.entrevista_notas },
      "lembrete",
      "painel"
    );
    refrescar(id);

    return r.ok
      ? { ok: true, mensagem: `Lembrete enviado para ${c.email}.` }
      : { ok: false, mensagem: `O email não saiu: ${r.erro?.slice(0, 120)}` };
  } catch {
    return { ok: false, mensagem: "Não foi possível enviar o lembrete." };
  }
}

/** Comunica a não selecção, com uma nota opcional. */
export async function comunicarReprovacao(id: string, nota?: string): Promise<Resultado> {
  // Permissão: só quem tem "enviar_email" chega aqui, venha o pedido de onde vier.
  try {
    await exigir("enviar_email");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  try {
    const c = await buscar(id);
    if (!c) return { ok: false, mensagem: "Candidato não encontrado." };

    const supabase = criarClienteServidor();
    await supabase
      .from("candidatos")
      .update({ status: "Reprovado", updated_at: new Date().toISOString() })
      .eq("id", id);

    const r = await enviarEmailReprovacao(c, nota?.trim() || null, "painel");
    refrescar(id);

    return r.ok
      ? { ok: true, mensagem: `Comunicado a ${c.email}. Estado alterado para Reprovado.` }
      : { ok: false, mensagem: `Estado alterado, mas o email não saiu: ${r.erro?.slice(0, 90)}` };
  } catch {
    return { ok: false, mensagem: "Não foi possível comunicar a decisão." };
  }
}

const esquemaMensagem = z.object({
  id: z.string().uuid(),
  assunto: z.string().trim().min(4, "O assunto está demasiado curto.").max(160),
  mensagem: z.string().trim().min(10, "Escreve a mensagem.").max(4000),
});

/** Mensagem escrita à mão pelo RH. */
export async function enviarMensagem(
  id: string,
  assunto: string,
  mensagem: string
): Promise<Resultado> {
  // Permissão: só quem tem "enviar_email" chega aqui, venha o pedido de onde vier.
  try {
    await exigir("enviar_email");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  const validado = esquemaMensagem.safeParse({ id, assunto, mensagem });
  if (!validado.success) {
    return { ok: false, mensagem: validado.error.errors[0]?.message ?? "Dados inválidos." };
  }

  try {
    const c = await buscar(id);
    if (!c) return { ok: false, mensagem: "Candidato não encontrado." };

    const r = await enviarEmailPersonalizado(c, validado.data.assunto, validado.data.mensagem, "painel");
    refrescar(id);

    return r.ok
      ? { ok: true, mensagem: `Mensagem enviada para ${c.email}.` }
      : { ok: false, mensagem: `O email não saiu: ${r.erro?.slice(0, 120)}` };
  } catch {
    return { ok: false, mensagem: "Não foi possível enviar a mensagem." };
  }
}

/** Volta a enviar a confirmação de candidatura (quando o candidato diz que não recebeu). */
export async function reenviarConfirmacao(id: string): Promise<Resultado> {
  // Permissão: só quem tem "enviar_email" chega aqui, venha o pedido de onde vier.
  try {
    await exigir("enviar_email");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  try {
    const c = await buscar(id);
    if (!c) return { ok: false, mensagem: "Candidato não encontrado." };

    const r = await enviarEmailCandidato(c);
    refrescar(id);

    return r.ok
      ? { ok: true, mensagem: `Confirmação reenviada para ${c.email}.` }
      : { ok: false, mensagem: `O email não saiu: ${r.erro?.slice(0, 120)}` };
  } catch {
    return { ok: false, mensagem: "Não foi possível reenviar." };
  }
}
