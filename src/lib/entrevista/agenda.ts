import { DESLOCAMENTO_ANGOLA } from "@/lib/datas";

/**
 * ===========================================================================
 * MOTOR DE ALOCAÇÃO DE HORÁRIOS
 * ---------------------------------------------------------------------------
 * Recebe parâmetros e devolve uma grelha. Função pura, sem rede e sem base de
 * dados: os mesmos parâmetros dão sempre exactamente a mesma grelha.
 *
 * É isso que torna o RECÁLCULO seguro. Mudar o número de salas ou a duração
 * não remenda a agenda antiga: gera a grelha toda de novo a partir dos
 * parâmetros. Não há estado escondido para ficar dessincronizado, e por isso
 * não há maneira de a agenda ficar meio velha e meio nova.
 *
 * TUDO EM HORA DE ANGOLA
 * A Vercel corre em UTC. Uma agenda construída com datas sem fuso marcaria as
 * entrevistas uma hora antes da hora certa, e os candidatos apareciam à hora
 * errada. Por isso os instantes nascem sempre com o deslocamento explícito.
 * ===========================================================================
 */

export interface ParametrosAgenda {
  /** Primeiro dia possível, no formato AAAA-MM-DD, hora de Angola. */
  dataInicio: string;
  /** Quantas entrevistas decorrem ao mesmo tempo. */
  salas: number;
  /** Minutos por entrevista. */
  duracaoMinutos: number;
  /** Minutos de folga entre entrevistas, para respirar e chamar o seguinte. */
  intervaloMinutos: number;
  /** Períodos de trabalho de cada dia, em hora local. */
  periodos: { inicio: string; fim: string }[];
  /** 0 é domingo, 6 é sábado. */
  diasDaSemana: number[];
  /** Dias a saltar, no formato AAAA-MM-DD: feriados, ou dias já ocupados. */
  excepcoes?: string[];
  /**
   * Instante ISO antes do qual não se gera vaga nenhuma.
   *
   * Sem isto, gerar uma agenda para HOJE às 14h produzia as vagas das 08:30,
   * 09:00 e 10:00 - todas já passadas - e depois era preciso apagá-las à mão
   * ou o sistema recusava o lote inteiro no fim. Saltá-las à nascença é mais
   * simples do que as apanhar depois.
   */
  naoAntesDe?: string | null;
}

export const PARAMETROS_PADRAO: Omit<ParametrosAgenda, "dataInicio"> = {
  salas: 2,
  duracaoMinutos: 30,
  intervaloMinutos: 0,
  // Manhã e tarde, com a pausa de almoço pelo meio.
  periodos: [
    { inicio: "08:30", fim: "12:30" },
    { inicio: "14:00", fim: "17:00" },
  ],
  diasDaSemana: [1, 2, 3, 4, 5],
  excepcoes: [],
};

export interface Vaga {
  /** Instante de início, em ISO com fuso. */
  inicio: string;
  fim: string;
  /** 1 a N. A sala é só um número: a equipa dá-lhe o nome que quiser. */
  sala: number;
  /** AAAA-MM-DD, para agrupar. */
  dia: string;
}

/** Um candidato colocado numa vaga. */
export interface Marcacao<T = string> {
  candidato: T;
  vaga: Vaga;
}

export interface Grelha<T = string> {
  marcacoes: Marcacao<T>[];
  /** Candidatos que não couberam no horizonte pedido. */
  sobram: T[];
  /** Quantos dias de calendário a grelha ocupa. */
  diasUsados: string[];
  vagasGeradas: number;
  parametros: ParametrosAgenda;
}

const MINUTO = 60 * 1000;

/** "08:30" -> 510 minutos desde a meia-noite. */
function emMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error(`Hora inválida no período: "${hora}". Usa o formato HH:MM.`);
  }
  return h * 60 + m;
}

/** Um instante em hora de Angola, a partir do dia e dos minutos do dia. */
function instante(dia: string, minutos: number): Date {
  const h = String(Math.floor(minutos / 60)).padStart(2, "0");
  const m = String(minutos % 60).padStart(2, "0");
  return new Date(`${dia}T${h}:${m}:00${DESLOCAMENTO_ANGOLA}`);
}

/** Soma dias a uma data AAAA-MM-DD sem cair em armadilhas de fuso. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00${DESLOCAMENTO_ANGOLA}`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** O dia da semana de AAAA-MM-DD em hora de Angola. 0 domingo, 6 sábado. */
export function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00${DESLOCAMENTO_ANGOLA}`).getUTCDay();
}

/**
 * Valida os parâmetros antes de gerar seja o que for.
 * Devolve a lista de problemas; vazia quer dizer que está tudo bem.
 */
export function validarParametros(p: ParametrosAgenda): string[] {
  const erros: string[] = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dataInicio)) erros.push("A data de início não é válida.");
  if (!Number.isInteger(p.salas) || p.salas < 1 || p.salas > 20)
    erros.push("O número de salas tem de estar entre 1 e 20.");
  if (!Number.isInteger(p.duracaoMinutos) || p.duracaoMinutos < 5 || p.duracaoMinutos > 240)
    erros.push("A duração tem de estar entre 5 e 240 minutos.");
  if (!Number.isInteger(p.intervaloMinutos) || p.intervaloMinutos < 0 || p.intervaloMinutos > 120)
    erros.push("O intervalo tem de estar entre 0 e 120 minutos.");
  if (!p.periodos.length) erros.push("Tem de haver pelo menos um período de trabalho.");
  if (!p.diasDaSemana.length) erros.push("Tem de haver pelo menos um dia da semana.");

  for (const periodo of p.periodos) {
    try {
      if (emMinutos(periodo.fim) <= emMinutos(periodo.inicio)) {
        erros.push(`O período ${periodo.inicio}-${periodo.fim} acaba antes de começar.`);
      }
    } catch (e) {
      erros.push((e as Error).message);
    }
  }

  // Um período mais curto do que uma entrevista não gera vaga nenhuma, e o
  // utilizador ficava com uma agenda vazia sem perceber porquê.
  if (!erros.length) {
    const cabeAlguma = p.periodos.some(
      (periodo) => emMinutos(periodo.fim) - emMinutos(periodo.inicio) >= p.duracaoMinutos
    );
    if (!cabeAlguma) {
      erros.push(
        `Nenhum período tem ${p.duracaoMinutos} minutos seguidos. Encurta a entrevista ou alarga o horário.`
      );
    }
  }

  return erros;
}

/** Quantas entrevistas cabem num dia, com estes parâmetros. */
export function vagasPorDia(p: ParametrosAgenda): number {
  const passo = p.duracaoMinutos + p.intervaloMinutos;
  return p.periodos.reduce((total, periodo) => {
    const abertura = emMinutos(periodo.fim) - emMinutos(periodo.inicio);
    // A última entrevista não precisa do intervalo a seguir: por isso a conta
    // é sobre a abertura mais um intervalo, dividida pelo passo.
    const cabem = Math.floor((abertura + p.intervaloMinutos) / passo);
    return total + Math.max(0, cabem) * p.salas;
  }, 0);
}

/**
 * Gera as vagas por ordem cronológica, e dentro da mesma hora por sala.
 *
 * A ordem importa: é ela que decide quem fica no primeiro dia. Enchemos hora
 * a hora, todas as salas, antes de passar à hora seguinte - assim a equipa
 * trabalha em paralelo e os dias ficam cheios de cima a baixo, em vez de uma
 * sala esgotar o dia enquanto as outras estão vazias.
 */
export function gerarVagas(p: ParametrosAgenda, quantas: number): Vaga[] {
  const vagas: Vaga[] = [];
  const excepcoes = new Set(p.excepcoes ?? []);
  const passo = p.duracaoMinutos + p.intervaloMinutos;
  const diasValidos = new Set(p.diasDaSemana);

  let dia = p.dataInicio;

  // O instante antes do qual não se gera nada. Uma data ilegível vale como
  // "sem limite", e não como "não geres nada".
  const limiteBruto = p.naoAntesDe ? new Date(p.naoAntesDe).getTime() : NaN;
  const limite = Number.isNaN(limiteBruto) ? null : limiteBruto;

  // Um limite de segurança: sem ele, parâmetros impossíveis dariam um ciclo
  // infinito em vez de uma agenda vazia.
  const MAXIMO_DIAS = 365;

  for (let d = 0; d < MAXIMO_DIAS && vagas.length < quantas; d++) {
    if (d > 0) dia = somarDias(dia, 1);

    if (!diasValidos.has(diaDaSemana(dia)) || excepcoes.has(dia)) continue;

    for (const periodo of p.periodos) {
      const abre = emMinutos(periodo.inicio);
      const fecha = emMinutos(periodo.fim);

      for (let t = abre; t + p.duracaoMinutos <= fecha; t += passo) {
        const comeca = instante(dia, t);

        // Uma vaga que já passou não serve para marcar nada.
        if (limite !== null && comeca.getTime() < limite) continue;

        for (let sala = 1; sala <= p.salas; sala++) {
          if (vagas.length >= quantas) return vagas;
          vagas.push({
            inicio: comeca.toISOString(),
            fim: instante(dia, t + p.duracaoMinutos).toISOString(),
            sala,
            dia,
          });
        }
      }
    }
  }

  return vagas;
}

/**
 * Distribui os candidatos pelas vagas.
 *
 * `limiteDias` serve para não gerar uma agenda que se estende por meio ano
 * quando os parâmetros não chegam para a quantidade de gente: o que sobra vem
 * na lista `sobram`, para a equipa decidir se abre mais salas, encurta a
 * entrevista, ou marca o resto para depois.
 */
export function distribuir<T>(
  candidatos: T[],
  p: ParametrosAgenda,
  limiteDias = 30
): Grelha<T> {
  const erros = validarParametros(p);
  if (erros.length) {
    return {
      marcacoes: [],
      sobram: [...candidatos],
      diasUsados: [],
      vagasGeradas: 0,
      parametros: p,
    };
  }

  const porDia = vagasPorDia(p);
  const tecto = Math.max(1, porDia * limiteDias);
  const vagas = gerarVagas(p, Math.min(candidatos.length, tecto));

  const marcacoes = candidatos
    .slice(0, vagas.length)
    .map((candidato, i) => ({ candidato, vaga: vagas[i] }));

  return {
    marcacoes,
    sobram: candidatos.slice(vagas.length),
    diasUsados: Array.from(new Set(vagas.map((v) => v.dia))).sort(),
    vagasGeradas: vagas.length,
    parametros: p,
  };
}

/** Agrupa a grelha por dia, para a mostrar e para notificar por lotes. */
export function agruparPorDia<T>(g: Grelha<T>): { dia: string; marcacoes: Marcacao<T>[] }[] {
  const mapa = new Map<string, Marcacao<T>[]>();
  for (const m of g.marcacoes) {
    const lista = mapa.get(m.vaga.dia) ?? [];
    lista.push(m);
    mapa.set(m.vaga.dia, lista);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, marcacoes]) => ({
      dia,
      marcacoes: marcacoes.sort(
        (x, y) => x.vaga.inicio.localeCompare(y.vaga.inicio) || x.vaga.sala - y.vaga.sala
      ),
    }));
}
