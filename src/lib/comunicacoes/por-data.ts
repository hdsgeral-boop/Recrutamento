/**
 * ===========================================================================
 * EMAILS POR DATA - TypeScript puro
 * ---------------------------------------------------------------------------
 * A pergunta que isto responde é a que se faz no dia seguinte a uma jornada
 * de entrevistas: «quem é que foi avisado para o dia 23?». Não é «o que saiu
 * hoje» - é «o que saiu PARA aquele dia».
 *
 * A diferença está em QUAL DATA se olha, e é toda a dificuldade do problema:
 *
 *  ENVIADO EM     quando o email saiu. É a data que a tabela guarda.
 *  MARCADO PARA   o dia do encontro de que o email fala. Está em
 *                 `eventos_candidato`, não no email.
 *
 * Um email enviado a 18 a convocar para 23 aparece nos dois sítios, por
 * razões diferentes, e confundi-los dá listas erradas com ar de certas. Por
 * isso o painel pergunta explicitamente qual das duas datas se quer.
 *
 * Tudo aqui é função pura sobre linhas já carregadas: nada de rede, e a data
 * «hoje» entra sempre por argumento, para os testes não dependerem do relógio.
 * ===========================================================================
 */

/** Fuso de Angola. O Vercel corre em UTC, por isso a conta é sempre explícita. */
const DESLOCAMENTO_ANGOLA = "+01:00";

export type Criterio = "enviado" | "marcado";

export interface EmailParaLista {
  id: string;
  candidatoId: string;
  /** Quando o email saiu, em ISO. */
  enviadoEm: string;
  tipo: string;
  destinatario: string;
  assunto: string;
  estado: "enviado" | "erro";
  erro: string | null;
  enviadoPor: string | null;
}

export interface EventoParaLista {
  candidatoId: string;
  fase: string;
  /** Instante do encontro, em ISO. */
  quando: string;
  /** Quando a marcação foi criada. É por aqui que se liga o email a ela. */
  criadoEm: string;
  local: string | null;
}

/** O dia em Angola de um instante ISO. Devolve "AAAA-MM-DD". */
export function diaEmAngola(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Luanda",
  }).format(d);
}

/** A hora em Angola, para a lista dizer a que horas era o encontro. */
export function horaEmAngola(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Luanda",
  }).format(d);
}

/** O dia de hoje em Angola, para o valor de omissão do campo de data. */
export function hojeEmAngola(agora: number = Date.now()): string {
  return diaEmAngola(new Date(agora).toISOString())!;
}

export interface LinhaListada {
  email: EmailParaLista;
  /** O encontro de que este email fala, quando se conseguiu ligar os dois. */
  evento: EventoParaLista | null;
}

export interface PedidoLista {
  /** "AAAA-MM-DD" em hora de Angola. */
  dia: string;
  criterio: Criterio;
  /** Vazio quer dizer todas. */
  fases: readonly string[];
  /** Vazio quer dizer todos. */
  tipos: readonly string[];
  /** Incluir os envios que falharam. */
  comFalhados: boolean;
}

/** A marcação e o email são gravados no mesmo pedido; a ordem dos
 *  milissegundos entre os dois não é garantida. Daí a folga. */
const FOLGA_MS = 60_000;

/**
 * Liga cada email ao encontro de que fala.
 *
 * A REGRA, e é ela que faz a diferença entre uma lista certa e uma lista com
 * ar de certa: de todas as marcações daquele candidato, escolhe-se a mais
 * recente que JÁ EXISTIA quando o email saiu.
 *
 * O que se compara é a data de CRIAÇÃO da marcação, não a data do encontro.
 * Um email não pode falar de uma marcação que ainda não tinha sido feita - e
 * sem esta condição, uma remarcação feita na semana seguinte roubava o email
 * ao encontro original e a lista do dia 23 ficava a apontar para o dia 30.
 */
export function ligarAoEvento(
  email: EmailParaLista,
  eventosDoCandidato: readonly EventoParaLista[]
): EventoParaLista | null {
  const saida = new Date(email.enviadoEm).getTime();
  if (Number.isNaN(saida)) return null;

  let melhor: EventoParaLista | null = null;
  let melhorCriacao = Number.NEGATIVE_INFINITY;
  let melhorDistancia = Number.POSITIVE_INFINITY;

  for (const e of eventosDoCandidato) {
    const criada = new Date(e.criadoEm).getTime();
    const quando = new Date(e.quando).getTime();
    if (Number.isNaN(criada) || Number.isNaN(quando)) continue;

    // Ainda não existia quando o email saiu: não pode ser esta.
    if (criada > saida + FOLGA_MS) continue;

    const distancia = Math.abs(quando - saida);

    // A mais recente ganha. Empatando na criação - o caso de várias fases
    // marcadas no mesmo lote - ganha a que está mais perto do envio.
    if (criada > melhorCriacao || (criada === melhorCriacao && distancia < melhorDistancia)) {
      melhorCriacao = criada;
      melhorDistancia = distancia;
      melhor = e;
    }
  }

  return melhor;
}

/** A lista pedida, já ordenada. */
export function listarPorData(
  emails: readonly EmailParaLista[],
  eventos: readonly EventoParaLista[],
  pedido: PedidoLista
): LinhaListada[] {
  const porCandidato = new Map<string, EventoParaLista[]>();
  for (const e of eventos) {
    const lista = porCandidato.get(e.candidatoId) ?? [];
    lista.push(e);
    porCandidato.set(e.candidatoId, lista);
  }

  const fases = new Set(pedido.fases);
  const tipos = new Set(pedido.tipos);

  const linhas: LinhaListada[] = [];

  for (const email of emails) {
    if (!pedido.comFalhados && email.estado === "erro") continue;
    if (tipos.size > 0 && !tipos.has(email.tipo)) continue;

    const evento = ligarAoEvento(email, porCandidato.get(email.candidatoId) ?? []);

    if (fases.size > 0 && !(evento && fases.has(evento.fase))) continue;

    const dia =
      pedido.criterio === "enviado"
        ? diaEmAngola(email.enviadoEm)
        : diaEmAngola(evento?.quando);

    if (dia !== pedido.dia) continue;

    linhas.push({ email, evento });
  }

  // Por hora do encontro quando é isso que se está a ver; por hora de envio
  // no outro caso. Em qualquer dos dois, a lista lê-se de cima para baixo
  // como o dia aconteceu.
  linhas.sort((a, b) => {
    const chave = (l: LinhaListada) =>
      pedido.criterio === "marcado"
        ? new Date(l.evento?.quando ?? l.email.enviadoEm).getTime()
        : new Date(l.email.enviadoEm).getTime();
    return chave(a) - chave(b);
  });

  return linhas;
}

export interface ResumoDoDia {
  total: number
  enviados: number;
  falhados: number;
  /** Quantos destinatários diferentes. */
  pessoas: number;
  /** Quantas marcações diferentes foram cobertas. */
  encontros: number;
  porFase: { fase: string; quantos: number }[];
}

/** O cabeçalho da lista: o que aconteceu naquele dia, em números. */
export function resumirDia(linhas: readonly LinhaListada[]): ResumoDoDia {
  const pessoas = new Set<string>();
  const encontros = new Set<string>();
  const porFase = new Map<string, number>();
  let falhados = 0;

  for (const l of linhas) {
    pessoas.add(l.email.candidatoId);
    if (l.email.estado === "erro") falhados++;
    if (l.evento) {
      encontros.add(`${l.evento.candidatoId}|${l.evento.quando}`);
      porFase.set(l.evento.fase, (porFase.get(l.evento.fase) ?? 0) + 1);
    }
  }

  return {
    total: linhas.length,
    enviados: linhas.length - falhados,
    falhados,
    pessoas: pessoas.size,
    encontros: encontros.size,
    porFase: [...porFase.entries()]
      .map(([fase, quantos]) => ({ fase, quantos }))
      .sort((a, b) => b.quantos - a.quantos),
  };
}

/** Os dias que têm alguma coisa, para o painel poder sugeri-los. */
export function diasComActividade(
  emails: readonly EmailParaLista[],
  eventos: readonly EventoParaLista[],
  criterio: Criterio
): string[] {
  const dias = new Set<string>();

  if (criterio === "enviado") {
    for (const e of emails) {
      const d = diaEmAngola(e.enviadoEm);
      if (d) dias.add(d);
    }
  } else {
    for (const e of eventos) {
      const d = diaEmAngola(e.quando);
      if (d) dias.add(d);
    }
  }

  return [...dias].sort((a, b) => b.localeCompare(a));
}

export { DESLOCAMENTO_ANGOLA };
