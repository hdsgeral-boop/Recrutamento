/**
 * ===========================================================================
 * DATAS NA HORA DE ANGOLA
 * ---------------------------------------------------------------------------
 * O servidor da Vercel corre em UTC. Sem dizer o fuso, um `toLocaleString`
 * mostra menos uma hora do que a hora real de Luanda - e um email a dizer que
 * a entrevista é às 08h30, quando é às 09h30, faz alguém perder a vaga.
 *
 * Angola está em UTC+1 o ano inteiro, sem hora de Verão. Por isso o
 * deslocamento é fixo e não há casos especiais.
 *
 * Regra: nenhuma data mostrada ao utilizador, nem no painel nem nos emails,
 * é formatada sem passar por aqui.
 * ===========================================================================
 */

export const FUSO_ANGOLA = "Africa/Luanda";
export const DESLOCAMENTO_ANGOLA = "+01:00";

const comFuso = (extra: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => ({
  timeZone: FUSO_ANGOLA,
  ...extra,
});

/** "15/09/2026, 09:30" */
export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString(
    "pt-PT",
    comFuso({ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
  );
}

/** "15/09, 09:30" - para tabelas apertadas. */
export function dataHoraCurta(iso: string): string {
  return new Date(iso).toLocaleString(
    "pt-PT",
    comFuso({ day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  );
}

/** "15/09/2026" */
export function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString(
    "pt-PT",
    comFuso({ day: "2-digit", month: "2-digit", year: "numeric" })
  );
}

/** "15/09/26" */
export function dataMuitoCurta(iso: string): string {
  return new Date(iso).toLocaleDateString(
    "pt-PT",
    comFuso({ day: "2-digit", month: "2-digit", year: "2-digit" })
  );
}

/** "15 de setembro de 2026, às 09h30" - a forma que vai nos emails. */
export function porExtenso(iso: string): string {
  const d = new Date(iso);
  const data = d.toLocaleDateString(
    "pt-PT",
    comFuso({ day: "numeric", month: "long", year: "numeric" })
  );
  const hora = d
    .toLocaleTimeString("pt-PT", comFuso({ hour: "2-digit", minute: "2-digit" }))
    .replace(":", "h");
  return `${data}, às ${hora}`;
}

/** "segunda-feira, 15 de setembro às 09h30" */
export function porExtensoComDia(iso: string): string {
  const d = new Date(iso);
  const data = d.toLocaleDateString(
    "pt-PT",
    comFuso({ weekday: "long", day: "numeric", month: "long" })
  );
  const hora = d
    .toLocaleTimeString("pt-PT", comFuso({ hour: "2-digit", minute: "2-digit" }))
    .replace(":", "h");
  return `${data} às ${hora}`;
}

/**
 * Converte o valor de um <input type="datetime-local"> em ISO, lendo-o SEMPRE
 * como hora de Angola.
 *
 * Um `new Date("2026-09-15T09:30")` seria interpretado no fuso do browser de
 * quem está a marcar. Quem marcasse de Lisboa em Agosto marcaria uma hora
 * antes sem dar por isso. Aqui, "09:30" quer dizer 09:30 em Caxito, esteja
 * quem marca onde estiver.
 */
export function doInputParaIso(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(valor)) return null;

  const semSegundos = valor.length === 16 ? `${valor}:00` : valor.slice(0, 19);
  const d = new Date(`${semSegundos}${DESLOCAMENTO_ANGOLA}`);

  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** O caminho inverso: ISO para o formato que o input entende, em hora de Angola. */
export function isoParaInput(iso: string): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSO_ANGOLA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

  // O formato sueco dá "2026-09-15 09:30", que só precisa do T.
  return p.replace(" ", "T");
}

/**
 * O início do dia, em hora de Angola, para um "2026-09-01" vindo de um
 * <input type="date">. Devolve ISO, pronto para o filtro do Supabase.
 */
export function inicioDoDia(dia: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const d = new Date(`${dia}T00:00:00${DESLOCAMENTO_ANGOLA}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * O fim do dia, também em hora de Angola.
 *
 * Usamos 23:59:59.999 e não o dia seguinte às 00:00 para o filtro poder ser
 * "menor ou igual" e o utilizador ver o intervalo que escreveu, incluindo o
 * último dia. Escolher 1 a 10 de Setembro tem de trazer as candidaturas do
 * dia 10.
 */
export function fimDoDia(dia: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const d = new Date(`${dia}T23:59:59.999${DESLOCAMENTO_ANGOLA}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** O dia de hoje em Angola, no formato do <input type="date">. */
export function hojeEmAngola(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSO_ANGOLA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** O dia que estava a ser vivido em Angola há N dias. */
export function haDias(dias: number): string {
  const d = new Date(Date.now() - dias * 86400000);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSO_ANGOLA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Quantos dias faltam, contados em dias inteiros. */
export function diasAte(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}
