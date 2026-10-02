import "server-only";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ESTADOS_PADRAO, NIVEIS_PADRAO, type EstadoCandidato, type NivelFunil } from "@/lib/funil/padrao";
import { GRAFICOS_PADRAO, type Grafico } from "@/lib/dashboard/campos";

/**
 * ===========================================================================
 * CONFIGURAÇÃO DO FUNIL, DOS ESTADOS E DOS GRÁFICOS
 * ---------------------------------------------------------------------------
 * Tudo vive em três colunas JSON na linha única de `definicoes`. Foi uma
 * escolha deliberada em vez de três tabelas novas:
 *
 *  - é UMA leitura, e serve a página toda. Numa conta Supabase Free e num
 *    Vercel Hobby, cada ida à base de dados custa tempo ao utilizador;
 *  - não há nada para juntar nem para ordenar: a configuração é pequena e
 *    lê-se inteira sempre;
 *  - e sobretudo: não se mexe numa única tabela que já esteja a funcionar.
 *
 * Se as colunas ainda não existirem - porque a migração ainda não correu -
 * nada rebenta: devolvem-se os valores de omissão e o painel avisa que está a
 * trabalhar com eles. O sistema nunca fica de pé só por causa de uma coluna.
 * ===========================================================================
 */

export interface ConfiguracaoFunil {
  niveis: NivelFunil[];
  estados: EstadoCandidato[];
  graficos: Grafico[];
  /** Falso quando se está a usar os valores de omissão por a base não os ter. */
  daBaseDeDados: boolean;
  /** Verdadeiro quando as colunas ainda não existem no Supabase. */
  porMigrar: boolean;
}

export const CONFIGURACAO_PADRAO: ConfiguracaoFunil = {
  niveis: NIVEIS_PADRAO,
  estados: ESTADOS_PADRAO,
  graficos: GRAFICOS_PADRAO,
  daBaseDeDados: false,
  porMigrar: false,
};

/** Um valor que veio da base de dados é sempre tratado como suspeito. */
function texto(v: unknown, omissao = ""): string {
  return typeof v === "string" ? v : omissao;
}
function numero(v: unknown, omissao: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : omissao;
}
function listaDeTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function saneiaEstado(v: unknown, i: number): EstadoCandidato | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const chave = texto(o.chave).trim();
  if (!chave) return null;
  return {
    chave,
    ordem: numero(o.ordem, i + 1),
    nome: texto(o.nome).trim() || chave,
    cor: /^#[0-9a-fA-F]{6}$/.test(texto(o.cor)) ? texto(o.cor) : "#64748b",
    proximoPasso: texto(o.proximoPasso),
    terminal: Boolean(o.terminal),
    aliases: listaDeTextos(o.aliases),
    activo: o.activo === undefined ? true : Boolean(o.activo),
  };
}

function saneiaNivel(v: unknown, i: number): NivelFunil | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const chave = texto(o.chave).trim();
  if (!chave) return null;
  const taxa = o.taxaPrevista;
  return {
    chave,
    ordem: numero(o.ordem, i + 1),
    nome: texto(o.nome).trim() || chave,
    perdeSeAqui: texto(o.perdeSeAqui),
    taxaPrevista:
      typeof taxa === "number" && Number.isFinite(taxa) && taxa > 0 && taxa <= 100
        ? Math.round(taxa * 10) / 10
        : null,
    cor: /^#[0-9a-fA-F]{6}$/.test(texto(o.cor)) ? texto(o.cor) : "#64748b",
    estados: listaDeTextos(o.estados),
    activo: o.activo === undefined ? true : Boolean(o.activo),
  };
}

function saneiaGrafico(v: unknown, i: number): Grafico | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const campo = texto(o.campo).trim();
  if (!campo) return null;
  return {
    id: texto(o.id).trim() || `g-${i}`,
    titulo: texto(o.titulo).trim() || "Gráfico",
    campo: campo as Grafico["campo"],
    agregacao: (texto(o.agregacao) || "contagem") as Grafico["agregacao"],
    feitio: (texto(o.feitio) || "barras") as Grafico["feitio"],
    topo: Math.min(24, Math.max(2, numero(o.topo, 8))),
  };
}

/** Nunca lança. Em qualquer falha, devolve os valores de omissão. */
export async function lerConfiguracaoFunil(): Promise<ConfiguracaoFunil> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .from("definicoes")
      .select("funil, estados, graficos")
      .eq("id", true)
      .maybeSingle();

    if (error) {
      // 42703 = coluna inexistente, 42P01 = tabela inexistente.
      const porMigrar = ["42703", "42P01"].includes((error as { code?: string }).code ?? "");
      return { ...CONFIGURACAO_PADRAO, porMigrar };
    }
    if (!data) return CONFIGURACAO_PADRAO;

    const niveis = Array.isArray(data.funil)
      ? data.funil.map(saneiaNivel).filter((n): n is NivelFunil => n !== null)
      : [];
    const estados = Array.isArray(data.estados)
      ? data.estados.map(saneiaEstado).filter((e): e is EstadoCandidato => e !== null)
      : [];
    const graficos = Array.isArray(data.graficos)
      ? data.graficos.map(saneiaGrafico).filter((g): g is Grafico => g !== null)
      : [];

    const temConfiguracao = niveis.length > 0 && estados.length > 0;

    return {
      niveis: niveis.length > 0 ? niveis.sort((a, b) => a.ordem - b.ordem) : NIVEIS_PADRAO,
      estados: estados.length > 0 ? estados.sort((a, b) => a.ordem - b.ordem) : ESTADOS_PADRAO,
      // Uma lista de gráficos vazia é uma escolha legítima: quem apagou todos
      // os gráficos não quer que eles voltem no recarregamento seguinte.
      graficos: temConfiguracao ? graficos : GRAFICOS_PADRAO,
      daBaseDeDados: temConfiguracao,
      porMigrar: false,
    };
  } catch {
    return CONFIGURACAO_PADRAO;
  }
}
