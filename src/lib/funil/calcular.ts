/**
 * ===========================================================================
 * CONTAS DO FUNIL - TypeScript puro, sem rede
 * ---------------------------------------------------------------------------
 * Duas leituras, e é importante não as confundir:
 *
 *  PREVISTO  quantos são precisos em cada degrau para chegar ao alvo. Conta-se
 *            de trás para a frente: se o alvo são 58 contratados e a
 *            contratação aproveita 85%, então são precisos 69 na avaliação, e
 *            assim por diante até à porta de entrada.
 *
 *  REAL      quantos estão lá agora, e que percentagem isso dá em relação ao
 *            degrau anterior. É a única forma honesta de saber se as taxas
 *            previstas são realistas para ESTE recrutamento.
 *
 * Nada aqui decide sobre ninguém. O funil conta pessoas por estado; quem muda
 * de estado é sempre uma pessoa da equipa, no painel.
 * ===========================================================================
 */

import type { EstadoCandidato, NivelFunil } from "@/lib/funil/padrao";

export interface LinhaFunil {
  nivel: NivelFunil;
  /** Quantos são precisos aqui para o alvo se cumprir. */
  precisos: number;
  /** Quantos estão cá agora. */
  tem: number;
  /** O que falta, nunca negativo. */
  faltam: number;
  /** Percentagem real de passagem desde o degrau anterior. null no primeiro. */
  taxaReal: number | null;
  /** Diferença entre a taxa real e a prevista, em pontos percentuais. */
  desvio: number | null;
  /** Quantas pessoas se perderam do degrau anterior para este. */
  perdidos: number | null;
}

/**
 * Quantos são precisos em cada degrau, contado de trás para a frente a partir
 * do alvo. Arredonda sempre para cima: meia pessoa não se apresenta a uma
 * entrevista.
 */
export function precisosPorNivel(niveis: NivelFunil[], alvo: number): number[] {
  const activos = niveis.filter((n) => n.activo).sort((a, b) => a.ordem - b.ordem);
  const saida = new Array<number>(activos.length).fill(0);
  if (activos.length === 0) return saida;

  const alvoLimpo = Number.isFinite(alvo) && alvo > 0 ? Math.ceil(alvo) : 0;
  saida[activos.length - 1] = alvoLimpo;

  for (let i = activos.length - 1; i > 0; i--) {
    const taxa = activos[i].taxaPrevista;
    // Sem taxa, ou com taxa absurda, o degrau anterior herda o mesmo número:
    // é conservador e nunca inventa uma necessidade que ninguém definiu.
    const util = typeof taxa === "number" && taxa > 0 && taxa <= 100 ? taxa : 100;
    saida[i - 1] = Math.ceil(saida[i] / (util / 100));
  }

  return saida;
}

/**
 * Traduz o valor gravado em `candidatos.status` para a chave de estado em
 * vigor. É o que permite mudar o vocabulário sem tocar na base de dados: uma
 * candidatura gravada como "Pendente" conta como Identificado.
 */
export function chaveDoEstado(status: string | null | undefined, estados: EstadoCandidato[]): string | null {
  if (!status) return null;
  const limpo = status.trim().toLowerCase();

  for (const e of estados) {
    if (e.chave.toLowerCase() === limpo) return e.chave;
  }
  for (const e of estados) {
    if (e.aliases.some((a) => a.trim().toLowerCase() === limpo)) return e.chave;
  }
  return null;
}

/** Quantos candidatos há em cada chave de estado. */
export function contarPorEstado(
  candidatos: { status: string | null }[],
  estados: EstadoCandidato[]
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const e of estados) mapa.set(e.chave, 0);

  for (const c of candidatos) {
    const chave = chaveDoEstado(c.status, estados);
    if (!chave) continue;
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }

  return mapa;
}

/** Percentagem com uma casa decimal, ou null quando a base é zero. */
function percentagem(parte: number, total: number): number | null {
  if (!total) return null;
  return Math.round((parte / total) * 1000) / 10;
}

/** O funil inteiro, pronto a desenhar. */
export function calcularFunil(
  candidatos: { status: string | null }[],
  niveis: NivelFunil[],
  estados: EstadoCandidato[],
  alvo: number
): LinhaFunil[] {
  const activos = niveis.filter((n) => n.activo).sort((a, b) => a.ordem - b.ordem);
  const porEstado = contarPorEstado(candidatos, estados);
  const precisos = precisosPorNivel(niveis, alvo);

  return activos.map((nivel, i) => {
    const tem = nivel.estados.reduce((s, chave) => s + (porEstado.get(chave) ?? 0), 0);
    const anterior =
      i === 0
        ? null
        : activos[i - 1].estados.reduce((s, chave) => s + (porEstado.get(chave) ?? 0), 0);

    const taxaReal = anterior === null ? null : percentagem(tem, anterior);

    return {
      nivel,
      precisos: precisos[i] ?? 0,
      tem,
      faltam: Math.max(0, (precisos[i] ?? 0) - tem),
      taxaReal,
      desvio:
        taxaReal === null || nivel.taxaPrevista === null
          ? null
          : Math.round((taxaReal - nivel.taxaPrevista) * 10) / 10,
      perdidos: anterior === null ? null : Math.max(0, anterior - tem),
    };
  });
}

/**
 * O degrau onde se perde mais gente. É o que interessa a quem decide: não
 * «quantos temos», mas «onde é que os estamos a perder».
 */
export function maiorPerda(linhas: LinhaFunil[]): LinhaFunil | null {
  let pior: LinhaFunil | null = null;
  for (const l of linhas) {
    if (l.perdidos === null || l.perdidos === 0) continue;
    if (!pior || l.perdidos > (pior.perdidos ?? 0)) pior = l;
  }
  return pior;
}


const LARGURA_MINIMA = 38;

/**
 * A largura de cada degrau, em percentagem.
 *
 * Não é a proporção crua, e é de propósito. Com um alvo pequeno, os degraus
 * de cima ficavam todos a 8% ou 10% - riscos finos, indistinguíveis uns dos
 * outros e sem espaço para o nome lá dentro. O que se faz é esticar o
 * intervalo: o degrau mais estreito fica em 38% e o mais largo
 * em 100%, com os do meio distribuídos entre os dois.
 *
 * A ORDEM mantém-se sempre (um degrau que precisa de mais gente nunca aparece
 * mais estreito do que outro que precisa de menos), e os números verdadeiros
 * estão escritos dentro de cada degrau. A largura é para se ver a forma do
 * funil de relance, não para se medir com uma régua.
 */
export function largurasDaPiramide(precisos: readonly number[]): number[] {
  if (precisos.length === 0) return [];

  const maximo = Math.max(...precisos);
  const minimo = Math.min(...precisos);

  if (maximo <= 0) return precisos.map(() => 100);
  // Todos iguais: uma coluna, e não uma pirâmide.
  if (maximo === minimo) return precisos.map(() => 100);

  return precisos.map((n) =>
    Math.round(LARGURA_MINIMA + (100 - LARGURA_MINIMA) * ((n - minimo) / (maximo - minimo)))
  );
}
