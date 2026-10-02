import { DESLOCAMENTO_ANGOLA } from "@/lib/datas";

/**
 * ===========================================================================
 * NÃO SE MARCA PARA ONTEM
 * ---------------------------------------------------------------------------
 * Uma entrevista marcada para uma data já passada não é um engano inofensivo:
 * o candidato recebe um email a convocá-lo para um dia que já foi, aparece no
 * painel como "agendada" para sempre, e ninguém dá por ela até alguém
 * perguntar porque é que aquela pessoa nunca foi entrevistada.
 *
 * Por isso a regra vive aqui, numa função pura, e é chamada nos dois sítios
 * que interessam: no ecrã, para avisar antes de carregar no botão, e no
 * servidor, que é onde tem mesmo de travar - um formulário pode ser
 * contornado, uma Server Action não.
 *
 * TUDO EM HORA DE ANGOLA. A Vercel corre em UTC; comparar uma data local com
 * "agora" em UTC dava uma hora de diferença, e às 00h30 de Luanda o sistema
 * recusava marcações para o próprio dia.
 * ===========================================================================
 */

/**
 * Uma folga curta, para não recusar uma marcação feita para "daqui a nada".
 *
 * Sem ela, marcar para as 09:00 às 08:59:58 dava erro por dois segundos, e a
 * pessoa não percebia porquê. Dois minutos chegam para isso e continuam a
 * recusar qualquer coisa que seja mesmo passado.
 */
export const FOLGA_MINUTOS = 2;

export interface Veredicto {
  ok: boolean;
  /** Null quando está tudo bem. */
  erro: string | null;
}

/** A data é válida e não está no passado? */
export function dataFutura(iso: string | null | undefined, agora: number = Date.now()): Veredicto {
  if (!iso) return { ok: false, erro: "Falta indicar a data e a hora." };

  const quando = new Date(iso).getTime();
  if (Number.isNaN(quando)) return { ok: false, erro: "A data e a hora não são válidas." };

  if (quando < agora - FOLGA_MINUTOS * 60_000) {
    return { ok: false, erro: "Essa data já passou. Marca para uma data futura." };
  }

  return { ok: true, erro: null };
}

/** Já passou? O contrário de dataFutura, para listar o que está atrasado. */
export function estaAtrasada(iso: string | null | undefined, agora: number = Date.now()): boolean {
  if (!iso) return false;
  const quando = new Date(iso).getTime();
  return !Number.isNaN(quando) && quando < agora;
}

/**
 * O dia de hoje em Angola, no formato AAAA-MM-DD.
 *
 * Serve para o atributo `min` dos campos de data: o browser deixa de oferecer
 * dias passados no calendário, o que evita o erro em vez de o corrigir.
 */
export function hojeEmAngola(agora: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Luanda",
  }).format(new Date(agora));
}

/**
 * O mínimo para um campo datetime-local, em hora de Angola.
 * Formato "AAAA-MM-DDTHH:MM", que é o que o browser espera.
 */
export function minimoParaInput(agora: number = Date.now()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Luanda",
  }).formatToParts(new Date(agora));

  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
}

/**
 * Empurra uma data mantendo a HORA que já tinha.
 *
 * É isto que faz "remarcar com base no que já tinham": quem estava às 09:00 na
 * sala 2 continua às 09:00 na sala 2, só noutro dia. Mudar também a hora
 * obrigava a reorganizar a agenda toda e a avisar as pessoas de duas coisas em
 * vez de uma.
 */
export function mesmaHoraNoutroDia(isoOriginal: string, diaNovo: string): string | null {
  const d = new Date(isoOriginal);
  if (Number.isNaN(d.getTime())) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(diaNovo)) return null;

  const hora = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Luanda",
  }).format(d);

  const novo = new Date(`${diaNovo}T${hora}:00${DESLOCAMENTO_ANGOLA}`);
  return Number.isNaN(novo.getTime()) ? null : novo.toISOString();
}

/** Soma dias a AAAA-MM-DD sem cair em armadilhas de fuso. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00${DESLOCAMENTO_ANGOLA}`);
  if (Number.isNaN(d.getTime())) return dia;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 é domingo, 6 é sábado, em hora de Angola. */
export function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00${DESLOCAMENTO_ANGOLA}`).getUTCDay();
}

/**
 * O próximo dia útil a partir de um dia, inclusive.
 * Usado para propor uma data nova que não caia num sábado.
 */
export function proximoDiaUtil(dia: string, diasValidos: number[] = [1, 2, 3, 4, 5]): string {
  let d = dia;
  for (let i = 0; i < 14; i++) {
    if (diasValidos.includes(diaDaSemana(d))) return d;
    d = somarDias(d, 1);
  }
  return dia;
}
