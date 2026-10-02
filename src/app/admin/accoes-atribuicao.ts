"use server";

import { revalidatePath } from "next/cache";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { validarEquipa } from "@/lib/entrevista/equipa";
import {
  podeRemarcar,
  type Modalidade,
  type Veredicto,
} from "@/lib/entrevista/modalidade";
import { enviarEmailEntrevista } from "@/lib/email";
import type { Candidato } from "@/types/database";
import { exigir } from "@/lib/utilizadores";
import {
  exigirGestaoDeEntrevistas,
  exigirEntrevistaDoCandidato,
  lerAtribuicao,
  registarHistorico,
} from "@/lib/entrevista/atribuicoes";
import { estadoValido, DEFINICOES_ESTADO, type EstadoGravado } from "@/lib/entrevista/estados";
import { GRUPOS, type GrupoExperiencia } from "@/lib/entrevista/experiencia";
import { dataHora } from "@/lib/datas";
import { dataFutura } from "@/lib/entrevista/quando";

/**
 * ===========================================================================
 * ATRIBUIÇÕES E ESTADOS
 * ---------------------------------------------------------------------------
 * Todas as escritas do módulo de entrevistas que não sejam a avaliação em si.
 *
 * Cada uma volta a confirmar a permissão no servidor. Esconder um botão no
 * ecrã impede o engano, não impede o abuso: quem souber o endereço da acção
 * chama-a à mesma.
 * ===========================================================================
 */

const MAXIMO_POR_LOTE = 60;

export interface Resultado {
  ok: boolean;
  mensagem: string;
  /** Quantos foram mesmo tratados. */
  feitos?: number;
}

// ---------------------------------------------------------------------------
// ATRIBUIR
// ---------------------------------------------------------------------------

/**
 * Atribui candidatos a uma EQUIPA de 1 a 3 recrutadores.
 *
 * O primeiro da lista é o responsável e vai para a coluna `recrutador`, que é
 * a mesma de sempre. A equipa inteira vai para `recrutadores`. É essa dupla
 * escrita que deixa o resto do sistema - filtros, contagens, vistas antigas -
 * continuar a funcionar sem uma linha alterada.
 *
 * Aceita uma string por compatibilidade com quem ainda chamar com um nome só.
 */
export async function atribuirCandidatos(
  candidatoIds: string[],
  recrutadores: string | string[]
): Promise<Resultado> {
  let sessao;
  try {
    sessao = await exigirGestaoDeEntrevistas();
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  const ids = [...new Set(candidatoIds)].slice(0, MAXIMO_POR_LOTE);
  if (ids.length === 0) return { ok: false, mensagem: "Não escolheste nenhum candidato." };

  const pedida = Array.isArray(recrutadores) ? recrutadores : [recrutadores];
  const validada = validarEquipa(pedida);
  if (!validada.ok) return { ok: false, mensagem: validada.erro! };

  const supabase = criarClienteServidor();

  // Só se atribui a quem tem mesmo a função ligada, e confere-se CADA UM da
  // equipa. Sem esta conferência, um pedido forjado punha candidatos em quem
  // nunca foi recrutador - e com equipas o buraco seria maior, porque bastava
  // esconder um nome no meio de dois válidos.
  const { data: contas } = await supabase
    .from("utilizadores_painel")
    .select("utilizador, nome, papel, e_recrutador, activo")
    .in("utilizador", validada.equipa);

  const porUtilizador = new Map(
    ((contas ?? []) as { utilizador: string; nome: string; e_recrutador: boolean; activo: boolean }[])
      .map((c) => [c.utilizador, c])
  );

  const maus = validada.equipa.filter((u) => {
    const c = porUtilizador.get(u);
    return !c?.activo || !c.e_recrutador;
  });

  if (maus.length > 0) {
    return {
      ok: false,
      mensagem: `Sem função de recrutador activa: ${maus.join(", ")}.`,
    };
  }

  const equipa = validada.equipa;
  const nomes = equipa.map((u) => porUtilizador.get(u)!.nome);

  // upsert por candidato_id: atribuir outra vez muda a equipa em vez de criar
  // uma segunda linha, que é o que o índice único já impediria.
  const agora = new Date().toISOString();
  const linha = (id: string) => ({
    candidato_id: id,
    recrutador: equipa[0],
    recrutadores: equipa,
    estado: "atribuida" as const,
    atribuida_por: sessao.utilizador,
    atribuida_em: agora,
    actualizada_em: agora,
  });

  let { error } = await supabase
    .from("atribuicoes_entrevista")
    .upsert(ids.map(linha), { onConflict: "candidato_id" });

  // A coluna da equipa pode ainda não existir. Em vez de falhar, grava-se o
  // responsável na coluna de sempre e avisa-se - é melhor ter a atribuição
  // feita com um recrutador do que não ter atribuição nenhuma.
  let semColuna = false;
  if (error && /recrutadores/i.test(error.message)) {
    semColuna = true;
    const r = await supabase.from("atribuicoes_entrevista").upsert(
      ids.map((id) => {
        const { recrutadores: _fora, ...resto } = linha(id);
        return resto;
      }),
      { onConflict: "candidato_id" }
    );
    error = r.error;
  }

  if (error) {
    const falta = /relation .* does not exist|could not find the table/i.test(error.message);
    return {
      ok: false,
      mensagem: falta
        ? "Falta correr a migração no Supabase. Cola o ficheiro supabase/CORRER-NO-SUPABASE.sql no SQL Editor."
        : error.message,
    };
  }

  for (const id of ids) {
    await registarHistorico(id, sessao.utilizador, "atribuiu", `para ${nomes.join(", ")}`);
  }

  revalidatePath("/admin/entrevistas");
  revalidatePath("/admin/entrevistas/atribuicao");

  const quem = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;

  return {
    ok: true,
    feitos: ids.length,
    mensagem: semColuna
      ? `${ids.length} candidato(s) atribuído(s) a ${nomes[0]}. Os outros recrutadores não ficaram gravados: falta correr a migração 20260922d_equipa_entrevista.sql.`
      : `${ids.length} candidato(s) atribuído(s) a ${quem}.`,
  };
}

/** Tira a atribuição. Não apaga histórico nem avaliações. */
export async function removerAtribuicao(candidatoIds: string[]): Promise<Resultado> {
  let sessao;
  try {
    sessao = await exigirGestaoDeEntrevistas();
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  const ids = [...new Set(candidatoIds)].slice(0, MAXIMO_POR_LOTE);
  if (ids.length === 0) return { ok: false, mensagem: "Não escolheste nenhum candidato." };

  const { error } = await criarClienteServidor()
    .from("atribuicoes_entrevista")
    .delete()
    .in("candidato_id", ids);

  if (error) return { ok: false, mensagem: error.message };

  for (const id of ids) await registarHistorico(id, sessao.utilizador, "retirou a atribuição");

  revalidatePath("/admin/entrevistas");
  revalidatePath("/admin/entrevistas/atribuicao");

  return { ok: true, feitos: ids.length, mensagem: `${ids.length} atribuição(ões) retirada(s).` };
}

// ---------------------------------------------------------------------------
// ESTADO
// ---------------------------------------------------------------------------

export async function mudarEstado(
  candidatoId: string,
  estado: EstadoGravado,
  motivo?: string
): Promise<Resultado> {
  if (!estadoValido(estado)) return { ok: false, mensagem: "Estado desconhecido." };

  // Quem entrevista pode mover o SEU processo; gerir os alheios exige gestão.
  let quem: string;
  try {
    const autorizacao = await exigirEntrevistaDoCandidato(candidatoId);
    quem = autorizacao.sessao.utilizador;
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  const actual = await lerAtribuicao(candidatoId);
  if (!actual) {
    return { ok: false, mensagem: "Este candidato ainda não tem recrutador atribuído." };
  }

  const patch: Record<string, unknown> = {
    estado,
    actualizada_em: new Date().toISOString(),
  };

  // Marcar "em entrevista" a primeira vez carimba quem começou e quando. Não
  // se volta a carimbar: interessa o início, não a última vez que se carregou.
  if (estado === "em_entrevista" && !actual.iniciada_em) {
    patch.iniciada_por = quem;
    patch.iniciada_em = new Date().toISOString();
  }

  // Dar por concluída carimba o FIM. Sem isto, o relógio do painel não tinha
  // por onde parar e continuava a contar para sempre - dias depois, com a
  // entrevista já guardada, ainda somava minutos.
  if (estado === "concluida" && !actual.concluida_em) {
    patch.concluida_por = quem;
    patch.concluida_em = new Date().toISOString();
  }

  // Reabrir uma entrevista apaga o fim: se ela volta a estar a decorrer, o
  // relógio tem de voltar a andar. Deixar o carimbo lá punha o painel a dizer
  // que já tinha acabado uma entrevista que está a acontecer.
  if (estado !== "concluida" && actual.concluida_em) {
    patch.concluida_por = null;
    patch.concluida_em = null;
  }

  const { error } = await criarClienteServidor()
    .from("atribuicoes_entrevista")
    .update(patch)
    .eq("candidato_id", candidatoId);

  if (error) return { ok: false, mensagem: error.message };

  await registarHistorico(
    candidatoId,
    quem,
    `mudou o estado para ${DEFINICOES_ESTADO[estado].rotulo}`,
    motivo?.trim() || undefined
  );

  revalidatePath("/admin/entrevistas");
  revalidatePath(`/admin/candidato/${candidatoId}`);

  return { ok: true, mensagem: `Estado alterado para ${DEFINICOES_ESTADO[estado].rotulo}.` };
}

/** Corrige à mão o grupo de experiência de um candidato. */
export async function definirGrupo(
  candidatoId: string,
  grupo: GrupoExperiencia | null
): Promise<Resultado> {
  if (grupo !== null && !GRUPOS.includes(grupo)) {
    return { ok: false, mensagem: "Grupo desconhecido." };
  }

  let quem: string;
  try {
    const autorizacao = await exigirEntrevistaDoCandidato(candidatoId);
    quem = autorizacao.sessao.utilizador;
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  const { error } = await criarClienteServidor()
    .from("atribuicoes_entrevista")
    .update({ grupo_manual: grupo, actualizada_em: new Date().toISOString() })
    .eq("candidato_id", candidatoId);

  if (error) return { ok: false, mensagem: error.message };

  await registarHistorico(
    candidatoId,
    quem,
    grupo ? `classificou como ${grupo === "com_experiencia" ? "com" : "sem"} experiência` : "voltou à classificação automática"
  );

  revalidatePath("/admin/entrevistas");
  revalidatePath(`/admin/candidato/${candidatoId}`);

  return {
    ok: true,
    mensagem: grupo ? "Grupo corrigido." : "Voltou a valer a classificação automática.",
  };
}

// ---------------------------------------------------------------------------
// A FUNÇÃO DE RECRUTADOR
// ---------------------------------------------------------------------------

/**
 * Liga ou desliga a função de recrutador numa conta.
 *
 * Desligar NÃO apaga as atribuições: elas ficam, para o histórico continuar a
 * fazer sentido, e o portão deixa de as aceitar porque lê a função na hora.
 */
export async function definirRecrutador(
  utilizador: string,
  activo: boolean
): Promise<Resultado> {
  let sessao;
  try {
    sessao = await exigir("gerir_utilizadores");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  const supabase = criarClienteServidor();

  const { data } = await supabase
    .from("utilizadores_painel")
    .select("utilizador, nome, papel")
    .eq("utilizador", utilizador)
    .limit(1);

  const conta = (data ?? [])[0] as { nome: string; papel: string } | undefined;
  if (!conta) return { ok: false, mensagem: "Conta não encontrada." };

  // Um visualizador não pode entrevistar: dar-lhe a função criava uma conta
  // com um botão que o servidor recusaria sempre.
  if (activo && !["admin", "gestor", "editor"].includes(conta.papel)) {
    return {
      ok: false,
      mensagem: "Só um administrador, gestor ou editor pode ter a função de recrutador.",
    };
  }

  const { error } = await supabase
    .from("utilizadores_painel")
    .update({ e_recrutador: activo })
    .eq("utilizador", utilizador);

  if (error) {
    const falta = /column .* does not exist/i.test(error.message);
    return {
      ok: false,
      mensagem: falta
        ? "Falta correr a migração no Supabase. Cola o ficheiro supabase/CORRER-NO-SUPABASE.sql no SQL Editor."
        : error.message,
    };
  }

  console.info(`[entrevistas] ${sessao.utilizador} ${activo ? "ligou" : "desligou"} a função de recrutador em ${utilizador}`);

  revalidatePath("/admin/utilizadores");
  revalidatePath("/admin/entrevistas/atribuicao");

  return {
    ok: true,
    mensagem: activo
      ? `${conta.nome} passa a ser recrutador. Já lhe podes atribuir candidatos.`
      : `${conta.nome} deixa de ser recrutador. As atribuições ficam no histórico.`,
  };
}

// ---------------------------------------------------------------------------
// REAGENDAR
// ---------------------------------------------------------------------------

/**
 * Muda a data de uma entrevista, mesmo com ela já aberta.
 *
 * Acontece: o candidato liga a dizer que não chega, ou senta-se e percebe-se
 * que falta um documento. Obrigar a cancelar e marcar de novo perdia o
 * estado, o recrutador e o que já tinha sido marcado.
 *
 * O que já foi respondido NÃO se apaga. Fica em rascunho no ecrã de quem
 * estava a entrevistar; se a entrevista recomeçar do zero, quem conduz
 * desmarca. Apagar respostas por causa de uma mudança de data seria decidir
 * por ele.
 */
/**
 * Lê a modalidade e as tentativas de um candidato e pergunta à regra se ainda
 * se pode remarcar.
 *
 * Vive aqui, do lado do servidor, e não no ecrã: esconder o botão não trava
 * ninguém que saiba o endereço da acção. As colunas podem ainda não existir -
 * nesse caso não há modalidade nenhuma e remarca-se como sempre se remarcou.
 */
async function deixaRemarcar(candidatoId: string): Promise<Veredicto> {
  try {
    const { data, error } = await criarClienteServidor()
      .from("candidatos")
      .select("entrevista_modalidade, chamada_tentativas, chamada_atendeu")
      .eq("id", candidatoId)
      .maybeSingle();

    if (error || !data) return { ok: true, erro: null };

    return podeRemarcar(
      data.entrevista_modalidade as Modalidade | null,
      Number(data.chamada_tentativas ?? 0),
      Boolean(data.chamada_atendeu)
    );
  } catch {
    return { ok: true, erro: null };
  }
}

export async function reagendarEntrevista(
  candidatoId: string,
  quandoIso: string,
  duracaoMinutos: number | null,
  motivo: string
): Promise<Resultado> {
  let quem: string;
  try {
    const autorizacao = await exigirEntrevistaDoCandidato(candidatoId);
    quem = autorizacao.sessao.utilizador;
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  // Reagendar para o passado é o engano mais fácil de cometer aqui: a caixa
  // abre com a data antiga lá dentro, e basta carregar sem pensar.
  const veredicto = dataFutura(quandoIso);
  if (!veredicto.ok) return { ok: false, mensagem: veredicto.erro! };

  // Quem escolheu chamada telefónica e gastou as três tentativas sem atender
  // não tem remarcação. É a única porta onde a regra fecha.
  const regra = await deixaRemarcar(candidatoId);
  if (!regra.ok) return { ok: false, mensagem: regra.erro! };

  const quando = new Date(quandoIso);

  const supabase = criarClienteServidor();

  const patch: Record<string, unknown> = { entrevista_em: quando.toISOString() };
  const d = Number(duracaoMinutos);
  if (Number.isFinite(d) && d >= 5 && d <= 240) patch.entrevista_duracao_min = d;

  const { error } = await supabase.from("candidatos").update(patch).eq("id", candidatoId);
  if (error) return { ok: false, mensagem: error.message };

  // O estado passa a "reagendada" e o carimbo de início limpa-se: a
  // entrevista nova ainda não começou, e deixar o relógio a contar do início
  // antigo dava um tempo que não quer dizer nada.
  const { error: erroEstado } = await supabase
    .from("atribuicoes_entrevista")
    .update({
      estado: "reagendada",
      iniciada_em: null,
      iniciada_por: null,
      actualizada_em: new Date().toISOString(),
    })
    .eq("candidato_id", candidatoId);

  if (erroEstado) return { ok: false, mensagem: erroEstado.message };

  await registarHistorico(
    candidatoId,
    quem,
    "reagendou a entrevista",
    `${dataHora(quando.toISOString())}${motivo.trim() ? ` - ${motivo.trim()}` : ""}`
  );

  revalidatePath("/admin/entrevistas");
  revalidatePath(`/admin/candidato/${candidatoId}`);

  return {
    ok: true,
    mensagem: `Reagendada para ${dataHora(quando.toISOString())}. O candidato não foi avisado - manda-lhe um lembrete em Comunicações.`,
  };
}

// ---------------------------------------------------------------------------
// RECUPERAR AS ATRASADAS
// ---------------------------------------------------------------------------

export interface PedidoRemarcacao {
  candidatoId: string;
  /** ISO. A data nova, venha escrita à mão ou calculada a partir da antiga. */
  novoInicio: string;
}

export interface ResultadoRemarcacao extends Resultado {
  remarcados: number;
  emailsEnviados: number;
  problemas: string[];
}

/**
 * Remarca entrevistas que ficaram para trás, e avisa os candidatos.
 *
 * Trata as duas maneiras de chegar à data nova, porque para o servidor são a
 * mesma coisa: uma data por candidato. Quem decide como é que ela foi obtida -
 * escrita à mão, ou empurrada mantendo a hora antiga - é o ecrã.
 *
 * O EMAIL É UM PASSO SEPARADO, mas por omissão vai.
 * Uma entrevista que já passou e é remarcada em silêncio é pior do que não
 * ser remarcada: o candidato continua sem saber de nada, e o painel passa a
 * dizer que está tudo bem. Por isso o email é o caminho normal, e não uma
 * opção que alguém se esquece de ligar.
 */
export async function remarcarAtrasadas(
  pedidos: PedidoRemarcacao[],
  avisarPorEmail: boolean,
  motivo: string
): Promise<ResultadoRemarcacao> {
  const falhar = (mensagem: string): ResultadoRemarcacao => ({
    ok: false,
    mensagem,
    remarcados: 0,
    emailsEnviados: 0,
    problemas: [],
  });

  let sessao;
  try {
    sessao = await exigirGestaoDeEntrevistas();
    if (avisarPorEmail) await exigir("enviar_email");
  } catch (erro) {
    return falhar(erro instanceof Error ? erro.message : "Sem permissão.");
  }

  const lote = pedidos.slice(0, MAXIMO_POR_LOTE);
  if (lote.length === 0) return falhar("Não escolheste ninguém para remarcar.");

  // Nenhuma data nova pode cair outra vez no passado. Remarcar uma entrevista
  // atrasada para outra data atrasada é o erro mais fácil de cometer aqui.
  for (const p of lote) {
    const veredicto = dataFutura(p.novoInicio);
    if (!veredicto.ok) return falhar(`${veredicto.erro} Corrige antes de remarcar.`);
  }

  const supabase = criarClienteServidor();

  const { data } = await supabase
    .from("candidatos")
    .select("*")
    .in("id", lote.map((p) => p.candidatoId));

  const porId = new Map(((data ?? []) as Candidato[]).map((c) => [c.id, c]));

  let remarcados = 0;
  let emailsEnviados = 0;
  const problemas: string[] = [];

  for (const pedido of lote) {
    const c = porId.get(pedido.candidatoId);
    if (!c) {
      problemas.push(`Candidatura ${pedido.candidatoId.slice(0, 8)} não encontrada.`);
      continue;
    }

    // A mesma regra da remarcação individual, candidato a candidato: quem
    // esgotou as três chamadas sem atender é SALTADO e fica dito porquê, em
    // vez de o lote inteiro falhar por causa de um.
    const regra = podeRemarcar(
      (c as { entrevista_modalidade?: string | null }).entrevista_modalidade as Modalidade | null,
      Number((c as { chamada_tentativas?: number }).chamada_tentativas ?? 0),
      Boolean((c as { chamada_atendeu?: boolean }).chamada_atendeu)
    );
    if (!regra.ok) {
      problemas.push(`${c.nome}: ${regra.erro}`);
      continue;
    }

    const quando = new Date(pedido.novoInicio).toISOString();

    try {
      const { error } = await supabase
        .from("candidatos")
        .update({ entrevista_em: quando })
        .eq("id", c.id);

      if (error) throw new Error(error.message);
      remarcados++;

      // O estado volta a "atribuída": tem recrutador e agora tem data nova.
      // O carimbo de início limpa-se, senão o relógio contava de uma
      // entrevista que nunca chegou a acontecer.
      await supabase
        .from("atribuicoes_entrevista")
        .update({
          estado: "atribuida",
          iniciada_em: null,
          iniciada_por: null,
          actualizada_em: new Date().toISOString(),
        })
        .eq("candidato_id", c.id);

      await registarHistorico(
        c.id,
        sessao.utilizador,
        "remarcou uma entrevista atrasada",
        `${dataHora(c.entrevista_em ?? "")} passa a ${dataHora(quando)}${motivo.trim() ? ` - ${motivo.trim()}` : ""}`
      );

      if (avisarPorEmail) {
        const r = await enviarEmailEntrevista(
          { ...c, entrevista_em: quando },
          { quando, local: c.entrevista_local ?? "", notas: c.entrevista_notas },
          "remarcada",
          sessao.utilizador
        );

        if (r.ok) emailsEnviados++;
        else problemas.push(`${c.nome}: o email não saiu (${(r.erro ?? "").slice(0, 60)})`);
      }
    } catch (erro) {
      problemas.push(`${c.nome}: ${erro instanceof Error ? erro.message.slice(0, 70) : "falhou"}`);
    }
  }

  revalidatePath("/admin/entrevistas");
  revalidatePath("/admin/entrevistas/atrasadas");

  return {
    ok: problemas.length === 0,
    remarcados,
    emailsEnviados,
    problemas,
    mensagem: avisarPorEmail
      ? `${remarcados} remarcada(s), ${emailsEnviados} candidato(s) avisado(s).`
      : `${remarcados} remarcada(s), sem avisar ninguém.`,
  };
}

/**
 * ===========================================================================
 * FINALIZAR A ENTREVISTA, HAJA O QUE HOUVER
 * ---------------------------------------------------------------------------
 * Fecha o processo e pára o relógio, mesmo sem avaliação nenhuma.
 *
 * PORQUE É QUE ISTO TEM DE EXISTIR
 * Nem toda a entrevista acaba com uma avaliação. O candidato não aparece, a
 * chamada não é atendida, a pessoa desiste a meio, o recrutador percebe nos
 * primeiros dois minutos que não é para ali. Até agora, nesses casos, a única
 * saída era marcar perguntas que ninguém fez - ou deixar o processo aberto,
 * com o relógio a contar para sempre.
 *
 * Nenhuma das duas serve. Inventar marcações é inventar uma avaliação; deixar
 * aberto é mentir ao painel sobre o que está a acontecer. Por isso há uma
 * terceira saída, que diz a verdade: a entrevista acabou, e não há nota.
 *
 * O MOTIVO FICA NO HISTÓRICO.
 * Uma entrevista fechada sem nota é uma decisão, e daqui a três meses alguém
 * vai querer saber porquê. Sem motivo escrito, a única leitura possível é que
 * o recrutador se esqueceu.
 * ===========================================================================
 */
export async function finalizarEntrevista(
  candidatoId: string,
  motivo?: string
): Promise<Resultado> {
  let quem: string;
  try {
    const autorizacao = await exigirEntrevistaDoCandidato(candidatoId);
    quem = autorizacao.sessao.utilizador;
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  const actual = await lerAtribuicao(candidatoId);
  if (!actual) {
    return { ok: false, mensagem: "Este candidato ainda não tem recrutador atribuído." };
  }

  if (actual.estado === "concluida" && actual.concluida_em) {
    return { ok: true, mensagem: "Esta entrevista já estava fechada." };
  }

  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = {
    estado: "concluida",
    actualizada_em: agora,
    concluida_por: quem,
    // Já fechada mas sem carimbo (uma das antigas): carimba-se agora, que é a
    // melhor hora que se consegue saber. Fica um relógio parado em vez de um
    // relógio a contar para sempre.
    concluida_em: actual.concluida_em ?? agora,
  };

  const { error } = await criarClienteServidor()
    .from("atribuicoes_entrevista")
    .update(patch)
    .eq("candidato_id", candidatoId);

  if (error) return { ok: false, mensagem: error.message };

  await registarHistorico(
    candidatoId,
    quem,
    "finalizou a entrevista sem avaliação",
    motivo?.trim() || undefined
  );

  revalidatePath("/admin/entrevistas");
  revalidatePath(`/admin/candidato/${candidatoId}`);

  return {
    ok: true,
    mensagem: "Entrevista finalizada. O relógio parou e o processo está fechado.",
  };
}
