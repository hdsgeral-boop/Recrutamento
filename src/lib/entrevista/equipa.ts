/**
 * ===========================================================================
 * A EQUIPA QUE ENTREVISTA - um a três recrutadores por entrevista
 * ---------------------------------------------------------------------------
 * A entrevista continua a ser UMA: uma linha em `atribuicoes_entrevista`, um
 * estado, uma data, uma avaliação. O que mudou foi quem a conduz - passou a
 * poder ser um painel de duas ou três pessoas.
 *
 * COMO ISTO NÃO PARTIU NADA: a coluna `recrutador` ficou onde estava e passou
 * a guardar o PRIMEIRO da lista, o responsável. Tudo o que já lia essa coluna
 * - filtros, contagens, o histórico, as vistas antigas - continua a ler a
 * mesma coisa e a dar a mesma resposta. A coluna nova, `recrutadores`, é que
 * guarda o painel inteiro, e só quem precisa dele é que lhe pega.
 *
 * Havendo as duas, a resposta certa à pergunta «quem entrevista este
 * candidato?» é sempre `equipaDe()`, nunca a coluna crua: numa base onde a
 * migração ainda não correu, `recrutadores` vem vazia e é o `recrutador`
 * sozinho que forma a equipa.
 * ===========================================================================
 */

export const MAXIMO_RECRUTADORES = 3;
export const MINIMO_RECRUTADORES = 1;

export interface ComEquipa {
  recrutador?: string | null;
  recrutadores?: string[] | null;
}

/**
 * A equipa de uma atribuição, sem repetições e sem vazios.
 *
 * O responsável vem sempre primeiro, mesmo que a lista gravada o traga a
 * meio: quem lê a lista de lado espera que o primeiro nome seja o de quem
 * responde pela entrevista.
 */
export function equipaDe(at: ComEquipa | null | undefined): string[] {
  if (!at) return [];

  const lista = Array.isArray(at.recrutadores) ? at.recrutadores : [];
  const responsavel = typeof at.recrutador === "string" ? at.recrutador.trim() : "";

  const vistos = new Set<string>();
  const saida: string[] = [];

  const juntar = (nome: unknown) => {
    if (typeof nome !== "string") return;
    const limpo = nome.trim();
    if (!limpo || vistos.has(limpo)) return;
    vistos.add(limpo);
    saida.push(limpo);
  };

  juntar(responsavel);
  for (const n of lista) juntar(n);

  return saida;
}

/** Esta pessoa entrevista este candidato? */
export function estaNaEquipa(at: ComEquipa | null | undefined, utilizador: string): boolean {
  const quem = utilizador.trim();
  if (!quem) return false;
  return equipaDe(at).includes(quem);
}

/** Quem responde pela entrevista. É o que fica na coluna `recrutador`. */
export function responsavelDe(at: ComEquipa | null | undefined): string | null {
  return equipaDe(at)[0] ?? null;
}

export interface EquipaValidada {
  ok: boolean;
  /** Já limpa, sem repetições, com o responsável à cabeça. */
  equipa: string[];
  erro: string | null;
}

/**
 * Valida uma equipa pedida pelo painel.
 *
 * Um mínimo de um, porque uma entrevista sem ninguém marcado não é uma
 * atribuição - é uma linha órfã que ninguém vai fazer. Um máximo de três,
 * porque foi o que se pediu, e porque a partir daí o candidato deixa de estar
 * numa entrevista e passa a estar num júri.
 */
export function validarEquipa(pedida: readonly string[]): EquipaValidada {
  const vistos = new Set<string>();
  const equipa: string[] = [];

  for (const nome of pedida) {
    if (typeof nome !== "string") continue;
    const limpo = nome.trim();
    if (!limpo || vistos.has(limpo)) continue;
    vistos.add(limpo);
    equipa.push(limpo);
  }

  if (equipa.length < MINIMO_RECRUTADORES) {
    return { ok: false, equipa, erro: "Escolhe pelo menos um recrutador." };
  }

  if (equipa.length > MAXIMO_RECRUTADORES) {
    return {
      ok: false,
      equipa,
      erro: `No máximo ${MAXIMO_RECRUTADORES} recrutadores por entrevista. Escolheste ${equipa.length}.`,
    };
  }

  return { ok: true, equipa, erro: null };
}

/** Como a equipa se lê numa linha da lista. */
export function equipaPorExtenso(
  equipa: readonly string[],
  nomePor: (utilizador: string) => string = (u) => u
): string {
  if (equipa.length === 0) return "Por atribuir";
  if (equipa.length === 1) return nomePor(equipa[0]);
  return `${nomePor(equipa[0])} + ${equipa.length - 1}`;
}
