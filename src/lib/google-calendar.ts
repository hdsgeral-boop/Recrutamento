import "server-only";
import { google, type calendar_v3 } from "googleapis";

import { EMPRESA } from "@/lib/constantes";
import {
  aindaAPreparar,
  explicarErro,
  falhouAPreparar,
  lerSala,
  montarEvento,
  type PedidoDeSala,
  type RespostaCalendar,
  type SalaCriada,
} from "@/lib/entrevista/sala";

/**
 * ===========================================================================
 * GOOGLE CALENDAR - criar a sala do Meet de cada entrevista
 * ---------------------------------------------------------------------------
 * Uma sala por candidato, à hora dele. Não é uma sala partilhada: com
 * cinquenta entrevistas seguidas na mesma sala, quem chega cedo entra na
 * entrevista de outra pessoa.
 *
 * PORQUE É QUE ISTO EXIGE OAUTH E NÃO SERVE UMA CONTA DE SERVIÇO
 * Criar uma conferência do Meet é um acto de um UTILIZADOR: a sala pertence a
 * alguém. Uma conta de serviço não é ninguém - não tem Meet, e o Calendar
 * responde-lhe "Invalid conference type value". Num Workspace dá-se a volta
 * com delegação a nível de domínio; numa conta pessoal não há volta nenhuma.
 * Por isso este módulo só trabalha pela via OAuth, e diz-o com todas as
 * letras quando não a encontra.
 *
 * O ÂMBITO É OUTRO, E É POR ISSO QUE O TOKEN ANTIGO NÃO CHEGA
 * O refresh token que já existe foi emitido para `drive.file`. Um token não
 * ganha âmbitos depois de emitido: é preciso autorizar outra vez, agora com
 * os dois, e substituir a variável. O ficheiro GOOGLE-CALENDAR.md tem o
 * passo a passo.
 * ===========================================================================
 */

export const ESCOPO_CALENDAR = "https://www.googleapis.com/auth/calendar.events";
export const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.file";

/** O calendário onde os eventos são criados. */
const CALENDARIO = process.env.GOOGLE_CALENDAR_ID || "primary";

export function calendarConfigurado(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

function obterCalendar(): calendar_v3.Calendar {
  if (!calendarConfigurado()) {
    throw new Error(
      "Google Calendar por configurar. Define GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET e " +
        "GOOGLE_OAUTH_REFRESH_TOKEN com o âmbito calendar.events - ver GOOGLE-CALENDAR.md."
    );
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth });
}

export interface ResultadoSala {
  ok: boolean;
  sala: SalaCriada | null;
  erro: string | null;
}

/**
 * Cria a sala de um candidato. Nunca lança: devolve o erro já traduzido, para
 * quem chama poder continuar o lote em vez de o perder todo.
 *
 * `sendUpdates: "none"` é deliberado. O convite do Google chegaria em inglês,
 * com o aspecto do Google e sem uma palavra sobre o processo - e o candidato
 * receberia dois emails a dizer coisas diferentes. O email que sai é o do
 * sistema, em português, e leva o link lá dentro.
 */
export async function criarSalaMeet(
  p: PedidoDeSala,
  candidatoId: string
): Promise<ResultadoSala> {
  const evento = montarEvento(p, candidatoId, EMPRESA.nome);
  if (!evento) return { ok: false, sala: null, erro: "A data da entrevista não é válida." };

  try {
    const calendar = obterCalendar();

    const r = await calendar.events.insert({
      calendarId: CALENDARIO,
      conferenceDataVersion: 1,
      sendUpdates: "none",
      requestBody: evento,
    });

    let dados = r.data as RespostaCalendar;
    let sala = lerSala(dados);

    // A criação da conferência é ASSÍNCRONA. A resposta ao insert pode vir sem
    // link e com o pedido em "pending"; o link aparece logo a seguir, no
    // evento. Sem esta espera, metade de um lote ficaria com o evento criado e
    // sem sala - e o candidato receberia um convite para lado nenhum.
    const eventoId = dados.id ?? null;

    for (let tentativa = 0; !sala && aindaAPreparar(dados) && eventoId && tentativa < 4; tentativa++) {
      await new Promise((r) => setTimeout(r, 800 * (tentativa + 1)));
      // O get não leva conferenceDataVersion: devolve sempre a conferência
      // no estado em que ela estiver.
      const outra = await calendar.events.get({ calendarId: CALENDARIO, eventId: eventoId });
      dados = outra.data as RespostaCalendar;
      sala = lerSala(dados);
    }

    if (!sala) {
      // Sem sala, o evento que ficou na agenda não serve para nada e só
      // confunde quem lá for. Apaga-se.
      if (eventoId) await apagarSala(eventoId);

      return {
        ok: false,
        sala: null,
        erro: falhouAPreparar(dados)
          ? "O Google recusou criar a sala do Meet para esta entrevista. Confirma que a conta que autorizou tem o Meet activo."
          : aindaAPreparar(dados)
            ? "O Google ainda estava a preparar a sala e não respondeu a tempo. Tenta outra vez daqui a um minuto."
            : "O Google criou o evento mas não devolveu link de videochamada. Confirma que a conta tem o Meet activo.",
      };
    }

    return { ok: true, sala, erro: null };
  } catch (erro) {
    console.error("[calendar] falhou a criar a sala:", erro);
    return { ok: false, sala: null, erro: explicarErro(erro) };
  }
}

/**
 * Apaga o evento de uma entrevista. Usa-se ao remarcar, para não ficarem
 * salas órfãs na agenda de quem autorizou.
 *
 * Um evento que já não existe não é um erro: o objectivo era que ele
 * desaparecesse, e desapareceu.
 */
export async function apagarSala(eventoId: string): Promise<{ ok: boolean; erro: string | null }> {
  if (!eventoId) return { ok: true, erro: null };

  try {
    await obterCalendar().events.delete({ calendarId: CALENDARIO, eventId: eventoId });
    return { ok: true, erro: null };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    if (/not found|404|deleted|410/i.test(msg)) return { ok: true, erro: null };
    return { ok: false, erro: explicarErro(erro) };
  }
}

export interface Diagnostico {
  configurado: boolean;
  ok: boolean;
  mensagem: string;
  /** Email da conta que autorizou, quando se consegue saber. */
  conta: string | null;
}

/**
 * Confirma que a ligação está de pé E que tem mesmo o âmbito do Calendar.
 *
 * Não basta listar calendários: `calendar.events` deixa listar e não deixa
 * criar conferências, e a diferença só aparece quando já há cinquenta emails
 * por enviar. Por isso o teste CRIA uma sala a sério, daqui a um ano, e
 * apaga-a a seguir. É o único teste que prova o que interessa.
 */
export async function testarCalendar(): Promise<Diagnostico> {
  if (!calendarConfigurado()) {
    return {
      configurado: false,
      ok: false,
      conta: null,
      mensagem:
        "Faltam as variáveis do Google. Segue o GOOGLE-CALENDAR.md e define GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET e GOOGLE_OAUTH_REFRESH_TOKEN.",
    };
  }

  const daquiAUmAno = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

  const r = await criarSalaMeet(
    {
      nome: "Teste do sistema",
      // Sem convidado: é um evento que nasce e morre dentro deste teste, e
      // convidar alguém mandava-lhe um convite para uma entrevista que não
      // existe.
      email: "",
      inicio: daquiAUmAno,
      duracaoMinutos: 15,
      referencia: "TESTE",
    },
    "teste-de-ligacao"
  );

  if (!r.ok) {
    return { configurado: true, ok: false, conta: null, mensagem: r.erro! };
  }

  if (r.sala?.eventoId) await apagarSala(r.sala.eventoId);

  return {
    configurado: true,
    ok: true,
    conta: null,
    mensagem: "Ligação ao Calendar a funcionar: criei uma sala de teste e apaguei-a a seguir.",
  };
}
