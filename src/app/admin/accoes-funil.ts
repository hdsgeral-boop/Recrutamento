"use server";

import { revalidatePath } from "next/cache";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigir } from "@/lib/utilizadores";
import { precisosPorNivel } from "@/lib/funil/calcular";
import type { EstadoCandidato, NivelFunil } from "@/lib/funil/padrao";
import type { Grafico } from "@/lib/dashboard/campos";

/**
 * ===========================================================================
 * GRAVAR A CONFIGURAÇÃO DO FUNIL, DOS ESTADOS E DOS GRÁFICOS
 * ---------------------------------------------------------------------------
 * Três coisas separadas, três acções separadas, porque se mudam em momentos
 * diferentes: os degraus do funil afinam-se uma vez por projecto, os estados
 * quase nunca, e os gráficos mexem-se todas as semanas.
 *
 * A validação aqui é dura de propósito. Uma configuração partida não dá um
 * erro bonito: dá um dashboard que mostra números errados a quem vai decidir
 * sobre contratações, e ninguém dá por isso.
 * ===========================================================================
 */

export interface Resultado {
  ok: boolean;
  mensagem: string;
}

function semPermissao(erro: unknown): Resultado {
  return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
}

/** Grava uma das três colunas e limpa a cache das páginas que a lêem. */
async function gravar(coluna: "funil" | "estados" | "graficos", valor: unknown): Promise<Resultado> {
  const supabase = criarClienteServidor();

  const { error } = await supabase
    .from("definicoes")
    .update({ [coluna]: valor })
    .eq("id", true);

  if (error) {
    const codigo = (error as { code?: string }).code;
    if (codigo === "42703") {
      return {
        ok: false,
        mensagem:
          "A coluna ainda não existe no Supabase. Corre a migração 20260922c_dashboard_e_funil.sql e tenta outra vez.",
      };
    }
    return { ok: false, mensagem: error.message.slice(0, 160) };
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/definicoes");
  revalidatePath("/admin");
  return { ok: true, mensagem: "Guardado." };
}

/* ═══════════════════════════════ DEGRAUS ═══════════════════════════════ */

export async function guardarNiveis(niveis: NivelFunil[], alvo: number): Promise<Resultado> {
  try {
    await exigir("configurar");
  } catch (erro) {
    return semPermissao(erro);
  }

  const activos = niveis.filter((n) => n.activo);
  if (activos.length < 2) {
    return { ok: false, mensagem: "O funil precisa de pelo menos dois degraus ligados." };
  }

  const chaves = new Set<string>();
  for (const n of niveis) {
    if (!n.chave.trim()) return { ok: false, mensagem: "Há um degrau sem chave." };
    if (chaves.has(n.chave)) {
      return { ok: false, mensagem: `A chave "${n.chave}" está repetida.` };
    }
    chaves.add(n.chave);

    if (!n.nome.trim()) return { ok: false, mensagem: `O degrau "${n.chave}" está sem nome.` };

    if (n.taxaPrevista !== null && (n.taxaPrevista <= 0 || n.taxaPrevista > 100)) {
      return {
        ok: false,
        mensagem: `A taxa de "${n.nome}" tem de ficar entre 1 e 100. Está ${n.taxaPrevista}.`,
      };
    }
  }

  // O primeiro degrau é a porta de entrada: uma taxa aí não tem de onde vir.
  const ordenados = [...activos].sort((a, b) => a.ordem - b.ordem);
  if (ordenados[0].taxaPrevista !== null) {
    return {
      ok: false,
      mensagem: `"${ordenados[0].nome}" é o primeiro degrau: não pode ter taxa de passagem, porque não há nada antes dele.`,
    };
  }

  // Uma configuração que peça mais gente do que o país tem é um erro de
  // digitação, não um plano. Vale a pena travá-la antes de ir para o painel.
  const precisos = precisosPorNivel(niveis, alvo);
  if (precisos[0] > 1_000_000) {
    return {
      ok: false,
      mensagem: `Com estas taxas seriam precisas ${precisos[0].toLocaleString("pt-PT")} candidaturas. Revê as percentagens mais baixas.`,
    };
  }

  return gravar("funil", niveis.map((n, i) => ({ ...n, ordem: i + 1 })));
}

/* ═══════════════════════════════ ESTADOS ═══════════════════════════════ */

export async function guardarEstados(estados: EstadoCandidato[]): Promise<Resultado> {
  try {
    await exigir("configurar");
  } catch (erro) {
    return semPermissao(erro);
  }

  if (estados.filter((e) => e.activo).length < 2) {
    return { ok: false, mensagem: "São precisos pelo menos dois estados ligados." };
  }

  // As chaves e os aliases partilham o mesmo espaço de nomes: é por ele que
  // se traduz o que está gravado em candidatos.status. Um nome em dois sítios
  // faria candidaturas aparecerem em dois estados ao mesmo tempo.
  const vistos = new Map<string, string>();
  for (const e of estados) {
    if (!e.chave.trim()) return { ok: false, mensagem: "Há um estado sem chave." };
    if (!e.nome.trim()) return { ok: false, mensagem: `O estado "${e.chave}" está sem nome.` };

    for (const nome of [e.chave, ...e.aliases]) {
      const k = nome.trim().toLowerCase();
      if (!k) continue;
      const dono = vistos.get(k);
      if (dono && dono !== e.chave) {
        return {
          ok: false,
          mensagem: `"${nome}" está em "${dono}" e em "${e.chave}" ao mesmo tempo. Cada nome só pode pertencer a um estado.`,
        };
      }
      vistos.set(k, e.chave);
    }
  }

  return gravar("estados", estados.map((e, i) => ({ ...e, ordem: i + 1 })));
}

/* ═══════════════════════════════ GRÁFICOS ══════════════════════════════ */

export async function guardarGraficos(graficos: Grafico[]): Promise<Resultado> {
  try {
    // A lista de gráficos é partilhada: o que uma pessoa guarda, toda a gente
    // passa a ver. Por isso segue a mesma regra do resto da configuração, e
    // não a de quem só consulta.
    await exigir("configurar");
  } catch (erro) {
    return semPermissao(erro);
  }

  if (graficos.length > 24) {
    return { ok: false, mensagem: "Vinte e quatro gráficos chegam. Apaga algum antes de acrescentar." };
  }

  const ids = new Set<string>();
  for (const g of graficos) {
    if (!g.titulo.trim()) return { ok: false, mensagem: "Há um gráfico sem título." };
    if (ids.has(g.id)) return { ok: false, mensagem: "Há dois gráficos com o mesmo identificador." };
    ids.add(g.id);
  }

  return gravar("graficos", graficos);
}
