/**
 * ===========================================================================
 * ESTADOS DO PROCESSO DE ENTREVISTA
 * ---------------------------------------------------------------------------
 * O estado de uma entrevista é meio guardado e meio deduzido, e a divisão é
 * deliberada.
 *
 * DEDUZIDO o que já existe noutro sítio:
 *   - não haver atribuição      -> "Não atribuída"
 *   - haver atribuição e data   -> "Agendada"
 *   - haver avaliação guardada  -> "Concluída"
 *
 * GUARDADO só o que ninguém consegue adivinhar: que o candidato não apareceu,
 * que a entrevista foi cancelada, que está a decorrer neste momento.
 *
 * A razão é simples: guardar "agendada" numa coluna obrigava a lembrar de a
 * actualizar sempre que a agenda marcasse uma data - e um dia alguém
 * esquecia-se, e o painel passava a mentir. O que se pode deduzir, deduz-se.
 * ===========================================================================
 */

export const ESTADOS = [
  "nao_atribuida",
  "atribuida",
  "agendada",
  "em_entrevista",
  "concluida",
  "reagendada",
  "ausente",
  "nao_realizada",
  "cancelada",
] as const;

export type Estado = (typeof ESTADOS)[number];

/** Os estados que a equipa marca à mão, e que por isso ficam gravados. */
export const ESTADOS_GRAVADOS = [
  "atribuida",
  "em_entrevista",
  "concluida",
  "cancelada",
  "reagendada",
  "ausente",
  "nao_realizada",
] as const;

export type EstadoGravado = (typeof ESTADOS_GRAVADOS)[number];

export interface DefinicaoEstado {
  rotulo: string;
  /** Classes do crachá. */
  crachá: string;
  /** Uma frase que diz o que este estado quer dizer, para o painel explicar. */
  explicacao: string;
  /** Ordem de leitura, do início do processo para o fim. */
  ordem: number;
  /** O processo acabou aqui. */
  terminal: boolean;
}

export const DEFINICOES_ESTADO: Record<Estado, DefinicaoEstado> = {
  nao_atribuida: {
    rotulo: "Não atribuída",
    crachá: "bg-slate-100 text-slate-700 ring-1 ring-slate-300",
    explicacao: "Ninguém ficou responsável por entrevistar este candidato.",
    ordem: 0,
    terminal: false,
  },
  atribuida: {
    rotulo: "Atribuída",
    crachá: "bg-violet-100 text-violet-800 ring-1 ring-violet-300",
    explicacao: "Já tem recrutador, mas ainda não tem data marcada.",
    ordem: 1,
    terminal: false,
  },
  agendada: {
    rotulo: "Agendada",
    crachá: "bg-sky-100 text-sky-800 ring-1 ring-sky-300",
    explicacao: "Tem recrutador e tem data. Falta acontecer.",
    ordem: 2,
    terminal: false,
  },
  em_entrevista: {
    rotulo: "Em entrevista",
    crachá: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
    explicacao: "A entrevista começou e ainda não foi guardada.",
    ordem: 3,
    terminal: false,
  },
  concluida: {
    rotulo: "Concluída",
    crachá: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
    explicacao: "A avaliação está guardada.",
    ordem: 4,
    terminal: true,
  },
  reagendada: {
    rotulo: "Reagendada",
    crachá: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300",
    explicacao: "A data mudou e a nova ainda não foi marcada.",
    ordem: 2,
    terminal: false,
  },
  ausente: {
    rotulo: "Faltou",
    crachá: "bg-orange-100 text-orange-900 ring-1 ring-orange-300",
    explicacao: "O candidato não compareceu à entrevista marcada.",
    ordem: 4,
    terminal: true,
  },
  nao_realizada: {
    rotulo: "Não realizada",
    crachá: "bg-slate-200 text-slate-700 ring-1 ring-slate-400",
    explicacao: "A entrevista não chegou a fazer-se, por outra razão.",
    ordem: 4,
    terminal: true,
  },
  cancelada: {
    rotulo: "Cancelada",
    crachá: "bg-rose-100 text-rose-800 ring-1 ring-rose-300",
    explicacao: "O processo foi cancelado.",
    ordem: 4,
    terminal: true,
  },
};

export interface EntradaEstado {
  /** O que está gravado na atribuição. Null quando não há atribuição. */
  gravado: EstadoGravado | null;
  /** Há data de entrevista marcada? */
  temData: boolean;
  /** Já existe avaliação guardada? */
  temAvaliacao: boolean;
}

/**
 * O estado que o painel mostra.
 *
 * A ordem das decisões é a ordem da verdade: uma avaliação guardada é um
 * facto mais forte do que qualquer coluna; um estado marcado à mão vale mais
 * do que uma dedução; e só no fim é que se deduz a partir da data.
 */
export function estadoVisivel(e: EntradaEstado): Estado {
  // 1. Facto consumado.
  if (e.temAvaliacao) return "concluida";

  // 2. Os que só uma pessoa sabe.
  if (
    e.gravado === "cancelada" ||
    e.gravado === "ausente" ||
    e.gravado === "nao_realizada" ||
    e.gravado === "em_entrevista" ||
    e.gravado === "reagendada"
  ) {
    return e.gravado;
  }

  // 3. Sem atribuição, não há processo.
  if (!e.gravado) return "nao_atribuida";

  // 4. Dedução.
  return e.temData ? "agendada" : "atribuida";
}

/** Os estados que a equipa pode escolher num menu, dado onde está agora. */
export function estadosPossiveis(actual: Estado): EstadoGravado[] {
  if (actual === "nao_atribuida") return [];
  // "Concluída" não se marca à mão: é a avaliação guardada que a produz.
  // Pô-la num menu dava um estado que não corresponde a nada gravado.
  return ["atribuida", "em_entrevista", "reagendada", "ausente", "nao_realizada", "cancelada"];
}

export function estadoValido(valor: unknown): valor is EstadoGravado {
  return (ESTADOS_GRAVADOS as readonly string[]).includes(valor as string);
}
