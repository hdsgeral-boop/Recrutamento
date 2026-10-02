/**
 * ===========================================================================
 * A SALA DA VIDEOCHAMADA - a parte que não fala com o Google
 * ---------------------------------------------------------------------------
 * Tudo o que se pode decidir sem rede fica aqui: o que se pede ao Calendar, e
 * como se lê o que ele responde. A chamada em si vive em
 * `src/lib/google-calendar.ts`, que não tem lógica nenhuma - só o pedido.
 *
 * A separação vale a pena por uma razão concreta: a resposta do Calendar tem
 * o link em dois sítios diferentes conforme o tipo de conferência, e já mudou
 * de forma no passado. Ler essa resposta é exactamente o género de código que
 * se quer testar sem depender de uma conta Google nem de uma ligação.
 * ===========================================================================
 */

/** Fuso do projecto. O Calendar exige-o por extenso, não um deslocamento. */
export const FUSO = "Africa/Luanda";

/** Só se aceita uma sala de Meet. Zoom, Teams e companhia não entram. */
const ANFITRIOES_VALIDOS = ["meet.google.com"];

export interface PedidoDeSala {
  /** Nome do candidato, para o evento se identificar na agenda. */
  nome: string;
  /** Email do candidato. Vai como convidado. */
  email: string;
  /** Início, ISO com fuso. */
  inicio: string;
  duracaoMinutos: number;
  /** Referência da candidatura, para se encontrar o evento depois. */
  referencia?: string;
}

export interface EventoParaCriar {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees: { email: string }[];
  conferenceData: {
    createRequest: {
      requestId: string;
      conferenceSolutionKey: { type: "hangoutsMeet" };
    };
  };
}

/**
 * O fim de uma entrevista, a partir do início e da duração.
 * Uma duração absurda não vira um evento absurdo: trava-se entre 5 e 240
 * minutos, que é o mesmo intervalo que o resto do sistema aceita.
 */
export function fimDaEntrevista(inicio: string, duracaoMinutos: number): string | null {
  const t = new Date(inicio).getTime();
  if (Number.isNaN(t)) return null;

  const d = Number(duracaoMinutos);
  const minutos = Number.isFinite(d) ? Math.min(240, Math.max(5, Math.round(d))) : 30;

  return new Date(t + minutos * 60_000).toISOString();
}

/**
 * Um identificador irrepetível para o pedido de conferência.
 *
 * O Google usa-o para não criar duas salas se o mesmo pedido chegar duas
 * vezes - um tempo limite da rede a meio de um lote, por exemplo. Por isso
 * tem de ser ESTÁVEL para a mesma entrevista e diferente entre entrevistas:
 * é o candidato mais o instante, e não um número ao acaso.
 */
export function idDoPedido(candidatoId: string, inicio: string): string {
  const instante = new Date(inicio).getTime();
  const base = `${candidatoId}-${Number.isNaN(instante) ? "0" : instante}`;
  return base.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
}

/** O corpo do evento que se manda ao Calendar. */
export function montarEvento(
  p: PedidoDeSala,
  candidatoId: string,
  empresa: string
): EventoParaCriar | null {
  const fim = fimDaEntrevista(p.inicio, p.duracaoMinutos);
  if (!fim) return null;

  const inicioIso = new Date(p.inicio).toISOString();

  return {
    summary: `Entrevista - ${p.nome}`,
    description: [
      `Entrevista de recrutamento - ${empresa}.`,
      p.referencia ? `Referência da candidatura: ${p.referencia}` : "",
      "",
      "Sala criada pelo sistema de recrutamento. Não apagues este evento sem",
      "primeiro remarcar a entrevista no painel: o candidato tem este link.",
    ]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: inicioIso, timeZone: FUSO },
    end: { dateTime: fim, timeZone: FUSO },
    // Sem email não se convida ninguém: uma lista com um convidado vazio
    // faz o Calendar recusar o evento inteiro.
    attendees: p.email.trim() ? [{ email: p.email.trim() }] : [],
    conferenceData: {
      createRequest: {
        requestId: idDoPedido(candidatoId, p.inicio),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
}

/** A forma da resposta do Calendar, reduzida ao que interessa. */
export interface RespostaCalendar {
  id?: string | null;
  hangoutLink?: string | null;
  htmlLink?: string | null;
  conferenceData?: {
    entryPoints?: { entryPointType?: string | null; uri?: string | null }[] | null;
    conferenceId?: string | null;
    createRequest?: {
      status?: { statusCode?: string | null } | null;
    } | null;
  } | null;
}

/**
 * O Google ainda está a criar a sala?
 *
 * A criação da conferência é ASSÍNCRONA: a resposta imediata ao insert pode
 * vir sem link e com o pedido em `pending`. Quem assumir que o link vem
 * sempre na primeira resposta grava metade dos candidatos sem sala e não dá
 * por isso - o evento existe, a marcação existe, e só falta a única coisa que
 * o candidato precisa.
 */
export function aindaAPreparar(resposta: RespostaCalendar | null | undefined): boolean {
  const estado = resposta?.conferenceData?.createRequest?.status?.statusCode;
  return estado === "pending";
}

/** O Google desistiu de criar a sala? */
export function falhouAPreparar(resposta: RespostaCalendar | null | undefined): boolean {
  return resposta?.conferenceData?.createRequest?.status?.statusCode === "failure";
}

export interface SalaCriada {
  link: string;
  eventoId: string | null;
}

/**
 * Tira o link da resposta do Calendar.
 *
 * `hangoutLink` é o caminho normal, mas nem sempre vem: em respostas onde a
 * conferência foi criada de fresco, o link só aparece no entryPoint de vídeo.
 * Tentam-se os dois, por esta ordem, e o resultado é conferido - uma resposta
 * com um `uri` de telefone em vez de vídeo devolveria um número de telefone
 * como se fosse uma sala.
 */
export function lerSala(resposta: RespostaCalendar | null | undefined): SalaCriada | null {
  if (!resposta) return null;

  const candidatos: (string | null | undefined)[] = [resposta.hangoutLink];

  for (const e of resposta.conferenceData?.entryPoints ?? []) {
    if (e?.entryPointType === "video") candidatos.push(e.uri);
  }

  for (const bruto of candidatos) {
    if (typeof bruto !== "string") continue;
    const link = bruto.trim();
    if (!link) continue;

    try {
      const url = new URL(link);
      if (url.protocol === "https:" && ANFITRIOES_VALIDOS.includes(url.hostname)) {
        return { link, eventoId: resposta.id ?? null };
      }
    } catch {
      // Não é um endereço. Segue para o seguinte.
    }
  }

  return null;
}

/**
 * Traduz o erro do Google para uma frase que diz o que fazer.
 *
 * Sem isto, o painel mostrava "Insufficient Permission" a quem não faz ideia
 * do que é um âmbito OAuth - e a pessoa que tem de resolver o problema é
 * exactamente essa.
 */
export function explicarErro(erro: unknown): string {
  const bruto = erro instanceof Error ? erro.message : String(erro ?? "");
  const t = bruto.toLowerCase();

  if (/insufficient|insufficientpermissions|forbidden|403/.test(t) && /scope|permission/.test(t)) {
    return "A autorização do Google não inclui o Calendar. Gera um refresh token novo com o âmbito calendar.events - o passo a passo está em GOOGLE-CALENDAR.md.";
  }
  if (/invalid_grant/.test(t)) {
    return "O refresh token do Google deixou de ser válido. Gera um novo e actualiza a variável GOOGLE_OAUTH_REFRESH_TOKEN.";
  }
  if (/calendar.*not.*enabled|accessnotconfigured|has not been used in project/.test(t)) {
    return "A Google Calendar API não está activada neste projecto do Google Cloud. Activa-a e espera um ou dois minutos.";
  }
  if (/invalid conference type|conferencedata|hangoutsmeet/.test(t)) {
    return "Esta conta Google não pode criar salas do Meet pela API. Contas de serviço não conseguem: usa a via OAuth com uma conta pessoal ou do Workspace.";
  }
  if (/quota|rate limit|429/.test(t)) {
    return "O Google recusou por excesso de pedidos. Espera um minuto e tenta outra vez.";
  }
  if (/timeout|etimedout|econnreset|fetch failed/.test(t)) {
    return "Não consegui falar com o Google. Verifica a ligação e tenta outra vez.";
  }

  return `O Google recusou: ${bruto.slice(0, 160)}`;
}
