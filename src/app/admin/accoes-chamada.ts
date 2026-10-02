"use server";

import { revalidatePath } from "next/cache";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirEntrevistaDoCandidato, registarHistorico } from "@/lib/entrevista/atribuicoes";
import {
  MAXIMO_TENTATIVAS,
  podeTentarChamada,
  DEFINICOES_MODALIDADE,
  modalidadeValida,
  resultadoValido,
  rotuloDoResultado,
  situacaoDaChamada,
  type LinhaTentativa,
  type Modalidade,
  type ResultadoChamada,
} from "@/lib/entrevista/modalidade";

/**
 * ===========================================================================
 * TENTATIVAS DE CHAMADA
 * ---------------------------------------------------------------------------
 * Quem escolheu entrevista por telefone é chamado até três vezes. Cada
 * tentativa regista-se aqui, e é o registo - não a memória de quem ligou -
 * que decide se ainda há mais alguma.
 *
 * PORQUE É QUE SE GUARDAM AS DUAS COISAS
 * Um contador em `candidatos` responde depressa à pergunta "quantas já
 * foram?", que é a que o painel faz a cada linha da lista. Uma linha por
 * tentativa em `tentativas_chamada` responde à pergunta que vem a seguir, e
 * que é a única que interessa quando um candidato reclama: quem ligou, a que
 * horas, e o que aconteceu. Um número sozinho não se defende.
 *
 * A contagem é lida e escrita AQUI, no servidor, a partir do que está
 * gravado. Nunca se aceita o número que o ecrã manda: bastava um pedido
 * forjado a dizer "tentativas: 0" para dar a alguém chamadas sem fim.
 * ===========================================================================
 */

export interface RespostaChamada {
  ok: boolean;
  mensagem: string;
  tentativas: number;
  restantes: number;
  esgotado: boolean;
}

function falhar(mensagem: string): RespostaChamada {
  return { ok: false, mensagem, tentativas: 0, restantes: 0, esgotado: false };
}

export async function registarTentativa(
  candidatoId: string,
  resultado: ResultadoChamada,
  observacoes = ""
): Promise<RespostaChamada> {
  let quem: string;
  try {
    // O mesmo portão das entrevistas: só a equipa a quem o candidato foi
    // atribuído, ou quem entrevista pelo papel.
    const autorizacao = await exigirEntrevistaDoCandidato(candidatoId);
    quem = autorizacao.sessao.utilizador;
  } catch (erro) {
    return falhar(erro instanceof Error ? erro.message : "Sem permissão.");
  }

  if (!resultadoValido(resultado)) return falhar("Resultado desconhecido.");

  const supabase = criarClienteServidor();

  const { data, error } = await supabase
    .from("candidatos")
    .select("nome, entrevista_modalidade, chamada_tentativas, chamada_atendeu")
    .eq("id", candidatoId)
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === "42703") {
      return falhar(
        "As colunas da chamada ainda não existem no Supabase. Corre a migração 20260922e_modalidade_entrevista.sql."
      );
    }
    return falhar(error.message.slice(0, 160));
  }
  if (!data) return falhar("Candidatura não encontrada.");

  const modalidade = data.entrevista_modalidade as Modalidade | null;
  const feitas = Number(data.chamada_tentativas ?? 0);
  const jaAtendeu = Boolean(data.chamada_atendeu);

  const pode = podeTentarChamada(modalidade, feitas, jaAtendeu);
  if (!pode.ok) {
    const s = situacaoDaChamada(modalidade, feitas, jaAtendeu);
    return { ok: false, mensagem: pode.erro!, tentativas: feitas, restantes: s.restantes, esgotado: s.estado === "esgotado" };
  }

  const numero = feitas + 1;
  const atendeu = resultado === "atendeu";

  // Primeiro o registo, depois o contador. Por esta ordem: se a segunda
  // escrita falhar, fica uma tentativa registada e um contador atrasado, que
  // se corrige a olhar para a lista. Ao contrário ficaria um contador gasto
  // sem nada que o explique, e o candidato perdia uma chamada por nada.
  const { error: erroRegisto } = await supabase.from("tentativas_chamada").insert({
    candidato_id: candidatoId,
    numero,
    resultado,
    quem,
    observacoes: observacoes.trim().slice(0, 500) || null,
  });

  if (erroRegisto) {
    const falta = /relation .* does not exist|could not find the table/i.test(erroRegisto.message);
    return falhar(
      falta
        ? "A tabela das tentativas ainda não existe no Supabase. Corre a migração 20260922e_modalidade_entrevista.sql."
        : erroRegisto.message.slice(0, 160)
    );
  }

  await supabase
    .from("candidatos")
    .update({ chamada_tentativas: numero, chamada_atendeu: atendeu })
    .eq("id", candidatoId);

  const etiqueta = rotuloDoResultado(resultado);
  await registarHistorico(
    candidatoId,
    quem,
    "tentativa de chamada",
    `${numero}.ª de ${MAXIMO_TENTATIVAS}: ${etiqueta}`
  );

  const s = situacaoDaChamada(modalidade, numero, atendeu);

  revalidatePath("/admin/entrevistas");
  revalidatePath(`/admin/candidato/${candidatoId}`);
  revalidatePath("/admin/comunicacoes");

  return {
    ok: true,
    mensagem: atendeu
      ? `Atendeu à ${numero}.ª tentativa. A entrevista pode começar.`
      : s.estado === "esgotado"
        ? `${numero}.ª tentativa registada. As ${MAXIMO_TENTATIVAS} chamadas foram feitas e não há remarcação.`
        : `${numero}.ª tentativa registada. Faltam ${s.restantes}.`,
    tentativas: numero,
    restantes: s.restantes,
    esgotado: s.estado === "esgotado",
  };
}

/** As tentativas já feitas, para a ficha do candidato. Nunca lança. */
export async function lerTentativas(candidatoId: string): Promise<LinhaTentativa[]> {
  try {
    const { data, error } = await criarClienteServidor()
      .from("tentativas_chamada")
      .select("numero, quando, resultado, quem, observacoes")
      .eq("candidato_id", candidatoId)
      .order("numero", { ascending: true });

    if (error) return [];
    return (data ?? []) as LinhaTentativa[];
  } catch {
    return [];
  }
}


/* ══════════════════ A ESCOLHA QUE O CANDIDATO MANDOU ════════════════════ */

export interface RespostaEscolha {
  ok: boolean;
  mensagem: string;
}

/**
 * Regista a modalidade que o candidato escolheu na resposta ao email.
 *
 * É a equipa que a regista, depois de ler a resposta. Não há aqui nenhuma
 * leitura automática de caixa de correio, e é de propósito: adivinhar a
 * escolha a partir do texto de um email erraria em silêncio, e o preço do
 * erro é uma pessoa a perder a entrevista por se ter ligado a quem esperava
 * uma videochamada.
 *
 * A contagem das três chamadas só começa DEPOIS desta escolha. Ninguém gasta
 * tentativas enquanto não disse que queria ser chamado.
 */
export async function registarEscolhaDoCandidato(
  candidatoId: string,
  modalidade: Modalidade
): Promise<RespostaEscolha> {
  let quem: string;
  try {
    const autorizacao = await exigirEntrevistaDoCandidato(candidatoId);
    quem = autorizacao.sessao.utilizador;
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  if (!modalidadeValida(modalidade)) {
    return { ok: false, mensagem: "Só se pode registar videochamada ou chamada." };
  }

  const supabase = criarClienteServidor();

  const { data } = await supabase
    .from("candidatos")
    .select("entrevista_link")
    .eq("id", candidatoId)
    .maybeSingle();

  // Escolher chamada não apaga a sala que já está criada: se o candidato
  // mudar de ideias, o link continua lá e não é preciso gerar outro.
  const { error } = await supabase
    .from("candidatos")
    .update({
      entrevista_modalidade: modalidade,
      modalidade_escolhida_em: new Date().toISOString(),
      modalidade_escolhida_por: quem,
      chamada_tentativas: 0,
      chamada_atendeu: false,
    })
    .eq("id", candidatoId);

  if (error) {
    if ((error as { code?: string }).code === "42703") {
      return {
        ok: false,
        mensagem:
          "As colunas da escolha ainda não existem no Supabase. Corre a migração 20260922f_sala_meet_e_escolha.sql.",
      };
    }
    return { ok: false, mensagem: error.message.slice(0, 160) };
  }

  await registarHistorico(
    candidatoId,
    quem,
    "escolha do candidato",
    DEFINICOES_MODALIDADE[modalidade].rotulo
  );

  revalidatePath(`/admin/candidato/${candidatoId}`);
  revalidatePath("/admin/entrevistas");

  const temSala = Boolean((data as { entrevista_link?: string | null } | null)?.entrevista_link);

  return {
    ok: true,
    mensagem:
      modalidade === "videochamada"
        ? temSala
          ? "Registado: videochamada. A sala já está criada e aparece no ecrã da entrevista."
          : "Registado: videochamada. Ainda não há sala criada para este candidato."
        : `Registado: chamada telefónica. Podes ligar até ${MAXIMO_TENTATIVAS} vezes.`,
  };
}
