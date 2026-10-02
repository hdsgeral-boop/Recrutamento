"use server";

import { revalidatePath } from "next/cache";
import { exigir } from "@/lib/utilizadores";
import { processarCandidato, processarPendentes } from "@/lib/analise/processar";

/** Acções do painel para a análise dos candidatos. */

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

/** Força uma nova análise, mesmo que os anexos não tenham mudado. */
export async function reanalisar(candidatoId: string): Promise<Resultado> {
  // Permissão: só quem tem "analisar" chega aqui, venha o pedido de onde vier.
  try {
    await exigir("analisar");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  const r = await processarCandidato(candidatoId, true);
  revalidatePath("/admin/ranking");
  revalidatePath(`/admin/candidato/${candidatoId}`);
  return { ok: r.ok, mensagem: r.mensagem };
}

/**
 * Lista os candidatos cuja análise falta ou está desactualizada.
 *
 * "Desactualizada" quer dizer feita por uma versão anterior do motor de
 * leitura: a análise antiga continua guardada, mas já não reflecte o que o
 * sistema consegue ler hoje.
 */
export async function listarPorAnalisar(): Promise<string[]> {
  const { criarClienteServidor } = await import("@/lib/supabase/servidor");
  const { versaoMotor } = await import("@/lib/analise/versao");
  const supabase = criarClienteServidor();

  const [{ data: todos }, { data: feitos }] = await Promise.all([
    supabase.from("candidatos").select("id").order("created_at", { ascending: false }),
    supabase
      .from("analises_candidato")
      .select("candidato_id, pontuacao_detalhe")
      .eq("estado", "concluida"),
  ]);

  const actualizados = new Set(
    (feitos ?? [])
      .filter((f) => {
        const detalhe = f.pontuacao_detalhe as { motor?: string } | null;
        return detalhe?.motor === versaoMotor();
      })
      .map((f) => f.candidato_id as string)
  );

  return (todos ?? []).map((c) => c.id as string).filter((id) => !actualizados.has(id));
}

/**
 * Analisa um punhado de candidatos e devolve o resultado.
 *
 * O painel chama isto em ciclo, poucos de cada vez. Um único pedido com 81
 * candidaturas passaria do tempo máximo de execução da Vercel; assim cada
 * pedido é curto e o utilizador vê a barra a andar.
 */
export async function analisarLote(
  ids: string[]
): Promise<{ ok: boolean; feitos: number; falhados: number; mensagem: string }> {
  try {
    await exigir("analisar");
  } catch (erro) {
    return {
      ok: false,
      feitos: 0,
      falhados: ids.length,
      mensagem: erro instanceof Error ? erro.message : "Sem permissão.",
    };
  }

  const lote = ids.slice(0, 3);

  const r = await Promise.allSettled(lote.map((id) => processarCandidato(id)));
  const feitos = r.filter((x) => x.status === "fulfilled" && x.value.ok).length;
  const falhados = lote.length - feitos;

  revalidatePath("/admin/ranking");
  revalidatePath("/admin");

  return {
    ok: falhados === 0,
    feitos,
    falhados,
    mensagem:
      falhados === 0
        ? `${feitos} analisada(s).`
        : `${feitos} analisada(s), ${falhados} falhada(s).`,
  };
}

/** Retoma as análises que ficaram a meio há mais de uma hora. */
export async function retomarPendentes(): Promise<Resultado> {
  const r = await processarPendentes();
  revalidatePath("/admin/ranking");
  return { ok: true, mensagem: `${r.tratados} candidatura(s) retomadas.` };
}
