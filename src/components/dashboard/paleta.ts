/**
 * ===========================================================================
 * CORES DOS GRÁFICOS
 * ---------------------------------------------------------------------------
 * Poucas cores, e cada uma com um trabalho definido. Foram passadas pelo
 * validador de paletas (contraste, bandas de luminosidade e separação para
 * daltonismo) contra o fundo branco do painel, que é o único que existe - o
 * painel não tem modo escuro.
 *
 * A REGRA QUE EXPLICA A LISTA SER TÃO CURTA: quase todos os gráficos desta
 * página são de UMA série. Um gráfico de uma série usa UMA cor; quem distingue
 * as barras é o rótulo ao lado, não o arco-íris. Cores diferentes só entram
 * onde a cor carrega mesmo identidade - o anel do sexo - e aí são duas, mais o
 * cinzento reservado a «não indicado», que é uma ausência e deve parecer uma.
 * ===========================================================================
 */

/** A cor de uma série única. Barras e linhas. */
export const SERIE = "#2a78d6";

/**
 * A rampa da pirâmide: um só tom, do claro ao escuro, sete degraus.
 *
 * É uma rampa ORDINAL e não uma paleta de categorias, e a diferença é toda:
 * os degraus do funil têm ORDEM, não identidade. Sete cores diferentes fariam
 * a cor parecer que distingue coisas quando só está a contar do primeiro ao
 * último - e, pior, nenhuma escolha de sete cores diferentes passa nos
 * limites de separação para daltonismo quando ficam encostadas umas às
 * outras. Assim, o tom escurece à medida que se sobe, o nome de cada degrau
 * está escrito ao lado, e ninguém precisa de distinguir azuis para ler.
 *
 * Passada pelo validador: luminosidade sempre a descer, folga de 0,06 entre
 * degraus, e o degrau mais claro a 2,11:1 contra o branco do painel.
 */
export const RAMPA_FUNIL = [
  "#86b6ef", "#719fd8", "#5c89c1", "#4874ab", "#345f95", "#214a80", "#0d366b",
] as const;

/** A cor de um degrau, contando de baixo (o mais largo) para cima. */
export function corDoDegrau(indice: number, total: number): string {
  if (total <= 1) return RAMPA_FUNIL[RAMPA_FUNIL.length - 1];
  const passo = (RAMPA_FUNIL.length - 1) / (total - 1);
  return RAMPA_FUNIL[Math.round(indice * passo)] ?? RAMPA_FUNIL[0];
}

/** Texto legível por cima de um degrau: os escuros pedem branco. */
export function tintaSobre(cor: string): string {
  const i = RAMPA_FUNIL.indexOf(cor as (typeof RAMPA_FUNIL)[number]);
  return i >= 0 && i <= 1 ? "#0f172a" : "#ffffff";
}

/** O anel do sexo: duas categorias reais, validadas em todos os pares. */
export const CATEGORIAS = ["#2a78d6", "#eb6834"] as const;

/** Reservado a «Não indicado» e a «Outros»: uma ausência parece uma ausência. */
export const SEM_DADO = "#94a3b8";

/**
 * Estados. Nunca aparecem sozinhos - vêm sempre com a palavra ao lado, e é
 * por isso que podem ser quatro cores próximas sem enganar ninguém.
 */
export const ESTADO = {
  bom: "#0ca30c",
  aviso: "#fab219",
  serio: "#ec835a",
  critico: "#d03b3b",
} as const;

/** A cor de uma fatia, pelo rótulo. */
export function corDaFatia(rotulo: string, i: number): string {
  if (rotulo === "Não indicado" || rotulo.startsWith("Outros")) return SEM_DADO;
  return CATEGORIAS[i % CATEGORIAS.length];
}

/** Números em português de Angola, sem casas decimais a mais. */
export function numero(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
}
