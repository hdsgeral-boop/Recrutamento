"use server";

import { revalidatePath } from "next/cache";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { enviarEmailFase } from "@/lib/email";
import { exigir } from "@/lib/utilizadores";
import { dataFutura } from "@/lib/entrevista/quando";
import {
  modalidadeGravadaValida,
  POR_ESCOLHER,
  validarLinkVideochamada,
  type ModalidadeGravada,
} from "@/lib/entrevista/modalidade";
import { calendarConfigurado, criarSalaMeet } from "@/lib/google-calendar";
import { DEFINICOES_FASE, faseValida, type Fase } from "@/lib/constantes-fases";
import type { Candidato } from "@/types/database";

/**
 * ===========================================================================
 * CONFIRMAR UMA AGENDA
 * ---------------------------------------------------------------------------
 * A marcação em massa dá a MESMA hora a toda a gente. A agenda dá a CADA
 * pessoa a sua hora e a sua sala. É a única diferença, e é toda a diferença:
 * cinquenta pessoas convocadas para as 09:00 é uma fila à porta; cinquenta
 * pessoas distribuídas por dois dias em duas salas é um processo.
 *
 * O caminho de escrita é de propósito o mesmo da marcação em massa:
 * `eventos_candidato` mais as colunas da entrevista em `candidatos`. Assim
 * esta página funciona hoje, sem depender das tabelas novas das entrevistas,
 * e as vistas que já existem (Comunicações, ficha do candidato, painel) vêem
 * estas marcações como vêem todas as outras. Nada do que já funciona muda.
 *
 * A grelha em si não se guarda. Guardam-se as marcações. A grelha é uma
 * função pura dos parâmetros (ver src/lib/entrevista/agenda.ts) e volta a
 * nascer igual sempre que for precisa.
 * ===========================================================================
 */

const MAXIMO_POR_LOTE = 5;

/** Uma pessoa, a sua hora e a sua sala. */
export interface VagaPedida {
  id: string;
  /** Instante de início, em ISO com fuso. */
  inicio: string;
  sala: number;
}

export interface PedidoAgenda {
  vagas: VagaPedida[];
  fase: Fase;
  local: string;
  notas: string;
  enviarEmail: boolean;
  aplicarEstado: boolean;
  /** Quantas salas existem ao todo, para só nomear a sala quando há mais de uma. */
  totalSalas: number;
  /**
   * Minutos previstos para cada entrevista. Serve o relógio que o
   * entrevistador vê; NUNCA entra no email do candidato.
   */
  duracaoMinutos?: number | null;
  /**
   * `por_escolher` (o candidato decide por email), videochamada ou chamada.
   * Nulo mantém o email exactamente como sempre foi.
   */
  modalidade?: ModalidadeGravada | null;
  /**
   * Link do Meet escrito à mão. Ignorado quando `gerarSala` está ligado - aí
   * cada candidato ganha a sua própria sala.
   */
  link?: string | null;
  /** Criar uma sala do Meet por candidato, pela API do Calendar. */
  gerarSala?: boolean;
}

export interface ResultadoAgenda {
  ok: boolean;
  marcados: number;
  emailsEnviados: number;
  problemas: string[];
}

export async function confirmarVagas(pedido: PedidoAgenda): Promise<ResultadoAgenda> {
  const vazio = (mensagem: string): ResultadoAgenda => ({
    ok: false,
    marcados: 0,
    emailsEnviados: 0,
    problemas: [mensagem],
  });

  // ------------------------------------------------------------ PERMISSÕES
  let sessao;
  try {
    sessao = await exigir("marcar_evento");
    if (pedido.enviarEmail) await exigir("enviar_email");
  } catch (erro) {
    return vazio(erro instanceof Error ? erro.message : "Sem permissão.");
  }

  // -------------------------------------------------------------- VALIDAR
  if (!faseValida(pedido.fase)) return vazio("Fase desconhecida.");
  if (!pedido.local.trim()) return vazio("Falta indicar o local.");

  const lote = pedido.vagas.slice(0, MAXIMO_POR_LOTE);
  if (lote.length === 0) return vazio("Não há vagas neste lote.");

  // Nenhuma vaga pode cair no passado. Um lote com uma data já passada mandava
  // um email a convocar alguém para um dia que já foi, e a marcação ficava
  // para sempre no painel como "agendada".
  for (const v of lote) {
    const veredicto = dataFutura(v.inicio);
    if (!veredicto.ok) {
      return vazio(`${veredicto.erro} (${new Date(v.inicio).toISOString().slice(0, 16)})`);
    }
  }

  for (const v of lote) {
    if (Number.isNaN(new Date(v.inicio).getTime())) {
      return vazio(`A hora "${v.inicio}" não é válida.`);
    }
  }

  // A modalidade valida-se ANTES de se escrever a primeira marcação. Meio
  // lote enviado com um link partido é pior do que lote nenhum.
  if (pedido.modalidade && !modalidadeGravadaValida(pedido.modalidade)) {
    return vazio("Modalidade desconhecida.");
  }

  // Um link à mão continua a ter de ser um link a sério. Quando as salas são
  // geradas, não há link à mão para validar.
  const querVideo = pedido.modalidade === "videochamada" || pedido.modalidade === POR_ESCOLHER;
  if (querVideo && !pedido.gerarSala && pedido.modalidade === "videochamada") {
    const v = validarLinkVideochamada(pedido.link ?? "");
    if (!v.ok) return vazio(v.erro!);
  }

  // Gerar salas sem a ligação configurada falharia candidato a candidato, com
  // metade do lote marcado e metade não. Mais vale recusar antes de começar.
  if (pedido.gerarSala && !calendarConfigurado()) {
    return vazio(
      "A ligação ao Google Calendar não está configurada, por isso não consigo gerar as salas. Segue o GOOGLE-CALENDAR.md, ou desliga a geração automática e cola um link à mão."
    );
  }

  const supabase = criarClienteServidor();
  const definicao = DEFINICOES_FASE[pedido.fase];
  const local = pedido.local.trim();

  // SEM MAPA, de propósito.
  //
  // No projecto UGP o email leva um link de mapa para o escritório do Lar do
  // Patriota, em Luanda. As entrevistas do Bengo não são lá. Mandar esse mapa
  // punha o candidato a atravessar a província para o sítio errado, com a
  // certeza de estar certo - que é pior do que não ter mapa nenhum.
  //
  // Quando houver um ponto de encontro fixo no Bengo, o caminho é o mesmo que
  // no UGP: um ficheiro com a morada e o Plus Code, e esta linha a apontar
  // para lá.

  const { data } = await supabase
    .from("candidatos")
    .select("*")
    .in("id", lote.map((v) => v.id));

  const porId = new Map(((data ?? []) as Candidato[]).map((c) => [c.id, c]));

  let marcados = 0;
  let emailsEnviados = 0;
  const problemas: string[] = [];

  for (const vaga of lote) {
    const c = porId.get(vaga.id);
    if (!c) {
      problemas.push(`Candidatura ${vaga.id.slice(0, 8)} não encontrada.`);
      continue;
    }

    // A sala só se diz ao candidato quando há mais do que uma. Com uma sala
    // só, "Sala 1" não informa nada e só levanta perguntas.
    const notas = pedido.notas.trim() || definicao.notas;
    const notasFinais =
      pedido.totalSalas > 1 ? `${notas}\nApresenta-te na Sala ${vaga.sala}.` : notas;

    const quando = new Date(vaga.inicio).toISOString();

    // A sala de CADA candidato, à hora dele. Uma sala partilhada por
    // cinquenta entrevistas seguidas faz com que quem chega cedo entre na
    // entrevista de outra pessoa.
    let linkDoCandidato = pedido.modalidade === "chamada" ? null : (pedido.link?.trim() || null);
    let eventoGoogle: string | null = null;

    if (pedido.gerarSala && querVideo) {
      const r = await criarSalaMeet(
        {
          nome: c.nome,
          email: c.email,
          inicio: quando,
          duracaoMinutos: Number(pedido.duracaoMinutos) || 30,
          referencia: c.bi,
        },
        c.id
      );

      if (!r.ok) {
        // Sem sala não se manda o email: o candidato receberia um convite
        // para uma videochamada sem videochamada nenhuma.
        problemas.push(`${c.nome}: ${r.erro}`);
        continue;
      }

      linkDoCandidato = r.sala!.link;
      eventoGoogle = r.sala!.eventoId;
    }

    try {
      const { error } = await supabase.from("eventos_candidato").insert({
        candidato_id: c.id,
        fase: pedido.fase,
        quando,
        local,
        observacoes: notasFinais,
        criado_por: sessao.utilizador,
        // A marcação guarda a modalidade com que foi feita, para mudar a
        // modalidade de alguém não reescrever a história das anteriores.
        modalidade: pedido.modalidade ?? null,
        link: linkDoCandidato,
        evento_google: eventoGoogle,
      });

      if (error) throw new Error(error.message);
      marcados++;

      // As colunas antigas da entrevista continuam a ser a fonte das vistas
      // que já existem. Mantemo-las certas.
      const actualizacao: Record<string, unknown> = {};

      if (pedido.fase === "entrevista") {
        actualizacao.entrevista_em = quando;
        actualizacao.entrevista_local = local;
        actualizacao.entrevista_notas = notasFinais;

        // A duração é interna: fica na ficha para o relógio do entrevistador,
        // e não vai em lado nenhum do que o candidato recebe.
        const d = Number(pedido.duracaoMinutos);
        if (Number.isFinite(d) && d >= 5 && d <= 240) actualizacao.entrevista_duracao_min = d;

        if (pedido.modalidade) {
          actualizacao.entrevista_modalidade = pedido.modalidade;
          actualizacao.entrevista_link = linkDoCandidato;
          actualizacao.entrevista_evento_google = eventoGoogle;
          // A escolha volta a estar por fazer: é uma marcação nova.
          actualizacao.modalidade_escolhida_em = null;
          actualizacao.modalidade_escolhida_por = null;
          // Marcar de novo começa a contagem do zero: são três tentativas
          // para ESTA marcação, não três para a vida toda do candidato.
          actualizacao.chamada_tentativas = 0;
          actualizacao.chamada_atendeu = false;
        }
      }

      if (pedido.aplicarEstado && definicao.estadoSugerido) {
        actualizacao.status = definicao.estadoSugerido;
      }

      if (Object.keys(actualizacao).length > 0) {
        await supabase.from("candidatos").update(actualizacao).eq("id", c.id);
      }

      if (pedido.enviarEmail) {
        const r = await enviarEmailFase(
          c,
          pedido.fase,
          {
            quando,
            local,
            notas: notasFinais,
            modalidade: pedido.modalidade ?? null,
            link: linkDoCandidato,
          },
          sessao.utilizador
        );

        if (r.ok) {
          emailsEnviados++;
          await supabase
            .from("eventos_candidato")
            .update({ email_enviado: true })
            .eq("candidato_id", c.id)
            .eq("quando", quando)
            .eq("fase", pedido.fase);
        } else {
          problemas.push(`${c.nome}: o email não saiu (${(r.erro ?? "").slice(0, 60)})`);
        }
      }
    } catch (erro) {
      problemas.push(`${c.nome}: ${erro instanceof Error ? erro.message.slice(0, 70) : "falhou"}`);
    }
  }

  revalidatePath("/admin/comunicacoes");
  revalidatePath("/admin");

  return { ok: problemas.length === 0, marcados, emailsEnviados, problemas };
}
