"use server";

import { revalidatePath } from "next/cache";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigir } from "@/lib/utilizadores";
import { lerRoteiroDaVersao } from "@/lib/entrevista/carregar-roteiro";
import { perguntasDoCandidato, pontuarEntrevista } from "@/lib/entrevista/pontuacao";
import { ESCALA, type Marcacao, type Pergunta } from "@/lib/entrevista/roteiro";
import type { Respostas } from "@/lib/entrevista/pontuacao";

/**
 * ===========================================================================
 * RECALCULAR AS NOTAS DAS ENTREVISTAS JÁ FEITAS
 * ---------------------------------------------------------------------------
 * A regra da nota mudou: passou a ser a soma dos pontos ganhos em 100, em vez
 * de uma percentagem do que tinha sido perguntado. As entrevistas gravadas
 * antes disso ficaram com o número da regra antiga, e comparar umas com as
 * outras na mesma tabela é comparar coisas diferentes.
 *
 * CADA AVALIAÇÃO É RECALCULADA COM O ROTEIRO COM QUE FOI FEITA.
 * Não com o roteiro de hoje. As marcações guardadas são respostas a perguntas
 * concretas, com os pesos que essas perguntas tinham nesse dia; pontuá-las
 * com os pesos de agora era mudar a avaliação de alguém por causa de uma
 * decisão tomada depois de ele ser entrevistado.
 *
 * AS MARCAÇÕES NÃO SE TOCAM.
 * Só muda o número calculado a partir delas. A prova de que a nota está certa
 * é poder chegar-se a ela outra vez a partir do que o entrevistador marcou, e
 * é por isso que as marcações são o que fica intocável.
 *
 * SEM O ROTEIRO DA VERSÃO, NÃO SE INVENTA.
 * Uma versão que já não existe em lado nenhum deixa a avaliação como está e
 * aparece na lista de saltadas. Pontuar com as perguntas erradas é pior do
 * que não pontuar.
 * ===========================================================================
 */

export interface MudancaNota {
  candidatoId: string;
  nome: string;
  versao: string;
  antes: number;
  depois: number;
  respondidas: number;
  totalPerguntas: number;
}

export interface ResultadoRecalculo {
  ok: boolean;
  mensagem: string;
  /** Quantas avaliações foram lidas. */
  lidas: number;
  /** As que mudaram de nota. */
  mudadas: MudancaNota[];
  /** As que ficaram iguais. */
  iguais: number;
  /** Versões de roteiro que já não existem: essas não se tocam. */
  saltadas: { versao: string; quantas: number }[];
  /** Falso quando é só uma simulação: nada foi gravado. */
  gravado: boolean;
}

interface LinhaAvaliacao {
  id: string;
  candidato_id: string;
  versao_roteiro: string;
  respostas: unknown;
  nota: number;
}

/**
 * @param aplicar false faz a conta e mostra o que mudaria, sem gravar nada.
 *   É o valor de omissão de propósito: ninguém deve mexer nas notas de toda a
 *   gente sem ver primeiro o que é que isso faz.
 */
export async function recalcularPontuacoes(aplicar = false): Promise<ResultadoRecalculo> {
  const vazio = (mensagem: string): ResultadoRecalculo => ({
    ok: false,
    mensagem,
    lidas: 0,
    mudadas: [],
    iguais: 0,
    saltadas: [],
    gravado: false,
  });

  try {
    await exigir("configurar");
  } catch (erro) {
    return vazio(erro instanceof Error ? erro.message : "Sem permissão.");
  }

  const supabase = criarClienteServidor();

  const { data, error } = await supabase
    .from("avaliacoes_entrevista")
    .select("id, candidato_id, versao_roteiro, respostas, nota")
    .order("criada_em", { ascending: true });

  if (error) {
    const falta = /relation .* does not exist|could not find the table/i.test(error.message);
    return vazio(
      falta
        ? "Falta correr a migração no Supabase antes de recalcular."
        : error.message
    );
  }

  const linhas = (data ?? []) as LinhaAvaliacao[];
  if (linhas.length === 0) {
    return { ...vazio("Não há entrevistas avaliadas para recalcular."), ok: true };
  }

  // Os nomes, só para a lista ser legível. Um id não diz nada a ninguém.
  const ids = [...new Set(linhas.map((l) => l.candidato_id))];
  const { data: pessoas } = await supabase
    .from("candidatos")
    .select("id, nome")
    .in("id", ids);
  const nomes = new Map((pessoas ?? []).map((p: { id: string; nome: string }) => [p.id, p.nome]));

  // O grupo gravado à mão, quando existe. Serve de desempate para as
  // avaliações em que as marcações não chegam para dizer o percurso.
  const { data: atribuicoes } = await supabase
    .from("atribuicoes_entrevista")
    .select("candidato_id, grupo_manual")
    .in("candidato_id", ids);
  const manuais = new Map(
    (atribuicoes ?? []).map((a: { candidato_id: string; grupo_manual: string | null }) => [
      a.candidato_id,
      a.grupo_manual,
    ])
  );

  // Os roteiros lêem-se UMA vez por versão, e não uma vez por avaliação.
  const cache = new Map<string, Pergunta[] | null>();
  async function roteiroDe(versao: string): Promise<Pergunta[] | null> {
    if (!cache.has(versao)) cache.set(versao, await lerRoteiroDaVersao(versao));
    return cache.get(versao) ?? null;
  }

  const mudadas: MudancaNota[] = [];
  const porGravar: { id: string; nota: number; peso_respondido: number; incompleta: boolean }[] = [];
  const saltadas = new Map<string, number>();
  let iguais = 0;

  for (const linha of linhas) {
    const perguntas = await roteiroDe(linha.versao_roteiro);
    if (!perguntas) {
      saltadas.set(linha.versao_roteiro, (saltadas.get(linha.versao_roteiro) ?? 0) + 1);
      continue;
    }

    // Só marcações que existem no roteiro dessa versão e que são marcações a
    // sério. Lixo guardado por engano não pode entrar numa nota.
    const respostas: Respostas = {};
    const guardadas = (linha.respostas ?? {}) as Record<string, unknown>;
    for (const p of perguntas) {
      const m = guardadas[p.codigo];
      if (typeof m === "string" && m in ESCALA) respostas[p.codigo] = m as Marcacao;
    }

    const manual = manuais.get(linha.candidato_id);
    const doPercurso = perguntasDoCandidato(
      perguntas,
      respostas,
      manual === "com_experiencia" || manual === "sem_experiencia" ? manual : "indeterminado"
    );

    const r = pontuarEntrevista(respostas, doPercurso, linha.versao_roteiro);

    if (r.nota === Number(linha.nota)) {
      iguais++;
      continue;
    }

    mudadas.push({
      candidatoId: linha.candidato_id,
      nome: nomes.get(linha.candidato_id) ?? "Candidato",
      versao: linha.versao_roteiro,
      antes: Number(linha.nota),
      depois: r.nota,
      respondidas: r.respondidas,
      totalPerguntas: r.totalPerguntas,
    });

    porGravar.push({
      id: linha.id,
      nota: r.nota,
      peso_respondido: r.pesoRespondido,
      incompleta: r.incompleta,
    });
  }

  const listaSaltadas = [...saltadas.entries()].map(([versao, quantas]) => ({ versao, quantas }));

  if (!aplicar) {
    return {
      ok: true,
      lidas: linhas.length,
      mudadas,
      iguais,
      saltadas: listaSaltadas,
      gravado: false,
      mensagem:
        mudadas.length === 0
          ? `Li ${linhas.length} entrevista(s). Nenhuma nota muda.`
          : `Li ${linhas.length} entrevista(s). ${mudadas.length} mudariam de nota. Nada foi gravado ainda.`,
    };
  }

  // Uma a uma, e não todas de uma vez: se uma falhar, as outras já corrigidas
  // ficam corrigidas, e diz-se quantas passaram.
  let gravadas = 0;
  const falhas: string[] = [];
  for (const g of porGravar) {
    const { error: erroGravar } = await supabase
      .from("avaliacoes_entrevista")
      .update({
        nota: g.nota,
        peso_respondido: g.peso_respondido,
        incompleta: g.incompleta,
      })
      .eq("id", g.id);

    if (erroGravar) falhas.push(erroGravar.message);
    else gravadas++;
  }

  revalidatePath("/admin/entrevistas");
  revalidatePath("/admin/entrevistas/resultados");
  revalidatePath("/admin/ranking");
  revalidatePath("/admin");

  return {
    ok: falhas.length === 0,
    lidas: linhas.length,
    mudadas,
    iguais,
    saltadas: listaSaltadas,
    gravado: true,
    mensagem:
      falhas.length === 0
        ? `${gravadas} nota(s) recalculada(s). ${iguais} já estavam certas.`
        : `${gravadas} de ${porGravar.length} gravadas. ${falhas.length} falharam: ${falhas[0]?.slice(0, 100)}`,
  };
}
