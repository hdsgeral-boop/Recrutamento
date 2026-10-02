import "server-only";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { equipaDe, estaNaEquipa, responsavelDe } from "@/lib/entrevista/equipa";
import { sessaoActual } from "@/lib/utilizadores";
import { pode, podeSerRecrutador, type Papel } from "@/lib/permissoes";
import { estadoVisivel, type Estado, type EstadoGravado } from "@/lib/entrevista/estados";
import {
  classificarExperiencia,
  CRITERIO_EXPERIENCIA,
  type Classificacao,
  type GrupoExperiencia,
} from "@/lib/entrevista/experiencia";
import type { Sessao } from "@/lib/auth";

/**
 * ===========================================================================
 * QUEM ENTREVISTA QUEM
 * ---------------------------------------------------------------------------
 * A leitura da lista de entrevistas e, mais importante, o PORTÃO: a função
 * que decide se esta pessoa pode entrevistar este candidato.
 *
 * O PORTÃO LÊ SEMPRE DA BASE DE DADOS, NUNCA DO COOKIE.
 * O cookie diz se alguém é recrutador, mas pode ter até 12 horas. Uma
 * atribuição muda num segundo. Autorizar uma entrevista com base no cookie
 * deixava um recrutador entrevistar, durante meio dia, um candidato que já
 * tinha passado para outra pessoa. Por isso o portão faz duas leituras
 * frescas: a função de recrutador, e a atribuição do candidato.
 * ===========================================================================
 */

export interface Atribuicao {
  id: string;
  candidato_id: string;
  /** O responsável. Continua a ser a mesma coluna de sempre. */
  recrutador: string | null;
  /** A equipa toda, 1 a 3. Vazia quando a migração ainda não correu. */
  recrutadores?: string[] | null;
  estado: EstadoGravado;
  grupo_manual: GrupoExperiencia | null;
  observacoes: string | null;
  atribuida_por: string | null;
  atribuida_em: string;
  iniciada_por: string | null;
  iniciada_em: string | null;
  concluida_por: string | null;
  concluida_em: string | null;
}

/** Uma linha da lista de entrevistas: candidato, processo e resultado. */
export interface LinhaEntrevista {
  candidatoId: string;
  nome: string;
  email: string;
  telefone: string;
  municipio: string;
  statusCandidatura: string;
  /** Data da entrevista, vinda da agenda. */
  quando: string | null;
  local: string | null;
  /** O responsável, para tudo o que já o mostrava. */
  recrutador: string | null;
  /** A equipa toda. Com um só elemento, é igual a [recrutador]. */
  recrutadores: string[];
  estado: Estado;
  experiencia: Classificacao;
  /** Nota da última avaliação, quando já foi entrevistado. */
  nota: number | null;
  versaoRoteiro: string | null;
  avaliadoEm: string | null;
  /** Pontuação da candidatura, para contexto. */
  pontuacaoPerfil: number | null;
  temAtribuicao: boolean;
}

export interface CargaEntrevistas {
  linhas: LinhaEntrevista[];
  /** A migração ainda não correu. */
  porMigrar: boolean;
  /** Quantos candidatos existem ao todo, incluindo os que este módulo não mostra. */
  totalCandidatos: number;
}

/**
 * O módulo de entrevistas só trabalha com quem JÁ FOI CONTACTADO.
 *
 * Entrevistar alguém a quem ninguém falou ainda não é possível: a pessoa não
 * sabe que foi seleccionada, não sabe onde é, e não vai aparecer. Mostrar a
 * lista inteira punha centenas de nomes por atribuir que ninguém ia atribuir,
 * e escondia os poucos que interessam.
 *
 * É a marcação que passa o candidato a Contactado (ver DEFINICOES_FASE), por
 * isso quem tem entrevista marcada pela Agenda já entra aqui sozinho.
 *
 * A excepção é deliberada: quem JÁ TEM processo de entrevista - atribuição ou
 * avaliação - fica na lista mesmo que alguém lhe mude o estado depois. Uma
 * entrevista feita não pode desaparecer do painel por causa de um clique
 * noutro ecrã.
 */
export const ESTADO_PARA_ENTREVISTAR = "Contactado";

interface LinhaAnalise {
  candidato_id: string;
  pontuacao_total: number | null;
  estado: string;
  pontuacao_detalhe: { criterios?: { codigo: string; pontos: number; maximo: number }[] } | null;
}

/**
 * Tudo o que a área de Entrevistas precisa, numa leitura só.
 *
 * Lê a lista inteira e junta em memória em vez de pedir por candidato: são
 * poucas centenas de linhas, e uma consulta por candidato punha a página a
 * fazer 180 viagens ao Supabase para desenhar uma tabela.
 */
export async function carregarEntrevistas(): Promise<CargaEntrevistas> {
  const supabase = criarClienteServidor();

  const [candidatosR, atribuicoesR, avaliacoesR, analisesR] = await Promise.all([
    supabase
      .from("candidatos")
      .select("id, nome, email, telefone, municipio, status, experiencia_similar, entrevista_em, entrevista_local")
      .order("nome", { ascending: true }),
    supabase.from("atribuicoes_entrevista").select("*"),
    supabase
      .from("avaliacoes_entrevista")
      .select("candidato_id, nota, versao_roteiro, criada_em")
      .order("criada_em", { ascending: false }),
    supabase
      .from("analises_candidato")
      .select("candidato_id, pontuacao_total, estado, pontuacao_detalhe")
      .eq("estado", "concluida")
      .order("criado_em", { ascending: false }),
  ]);

  // Sem a tabela das atribuições não há módulo. O resto das leituras pode
  // falhar sem drama: a lista sai com menos informação, mas sai.
  if (atribuicoesR.error) return { linhas: [], porMigrar: true, totalCandidatos: 0 };

  const porCandidato = new Map<string, Atribuicao>();
  for (const a of (atribuicoesR.data ?? []) as Atribuicao[]) porCandidato.set(a.candidato_id, a);

  // A primeira de cada candidato é a mais recente: vêm ordenadas.
  const avaliacoes = new Map<string, { nota: number; versao: string; quando: string }>();
  for (const a of (avaliacoesR.data ?? []) as { candidato_id: string; nota: number; versao_roteiro: string; criada_em: string }[]) {
    if (!avaliacoes.has(a.candidato_id)) {
      avaliacoes.set(a.candidato_id, { nota: Number(a.nota), versao: a.versao_roteiro, quando: a.criada_em });
    }
  }

  const analises = new Map<string, LinhaAnalise>();
  for (const a of (analisesR.data ?? []) as LinhaAnalise[]) {
    if (!analises.has(a.candidato_id)) analises.set(a.candidato_id, a);
  }

  const candidatos = (candidatosR.data ?? []) as {
    id: string; nome: string; email: string; telefone: string; municipio: string;
    status: string; experiencia_similar: boolean | null;
    entrevista_em: string | null; entrevista_local: string | null;
  }[];

  const linhas: LinhaEntrevista[] = candidatos
    .filter((c) => {
      if (c.status === ESTADO_PARA_ENTREVISTAR) return true;
      // Quem já tem processo fica, seja qual for o estado actual.
      return porCandidato.has(c.id) || avaliacoes.has(c.id);
    })
    .map((c) => {
    const at = porCandidato.get(c.id) ?? null;
    const av = avaliacoes.get(c.id) ?? null;
    const an = analises.get(c.id) ?? null;

    const criterio = an?.pontuacao_detalhe?.criterios?.find((x) => x.codigo === CRITERIO_EXPERIENCIA);

    return {
      candidatoId: c.id,
      nome: c.nome,
      email: c.email,
      telefone: c.telefone,
      municipio: c.municipio,
      statusCandidatura: c.status,
      quando: c.entrevista_em,
      local: c.entrevista_local,
      recrutador: responsavelDe(at),
      recrutadores: equipaDe(at),
      estado: estadoVisivel({
        gravado: at?.estado ?? null,
        temData: Boolean(c.entrevista_em),
        temAvaliacao: av !== null,
      }),
      experiencia: classificarExperiencia({
        manual: at?.grupo_manual ?? null,
        criterio: criterio ? { pontos: criterio.pontos, maximo: criterio.maximo } : null,
        declarou: c.experiencia_similar,
      }),
      nota: av?.nota ?? null,
      versaoRoteiro: av?.versao ?? null,
      avaliadoEm: av?.quando ?? null,
      pontuacaoPerfil: an?.pontuacao_total ?? null,
      temAtribuicao: at !== null,
    };
  });

  return { linhas, porMigrar: false, totalCandidatos: candidatos.length };
}

/** Uma atribuição só, para a ficha do candidato. */
export async function lerAtribuicao(candidatoId: string): Promise<Atribuicao | null> {
  const { data, error } = await criarClienteServidor()
    .from("atribuicoes_entrevista")
    .select("*")
    .eq("candidato_id", candidatoId)
    .limit(1);

  if (error) return null;
  return ((data ?? [])[0] ?? null) as Atribuicao | null;
}

/** Quem tem a função de recrutador ligada, e está activo. */
export async function listarRecrutadores(): Promise<
  { utilizador: string; nome: string; papel: Papel; atribuidos: number }[]
> {
  const supabase = criarClienteServidor();

  const [contasR, atribuicoesR] = await Promise.all([
    supabase
      .from("utilizadores_painel")
      .select("utilizador, nome, papel, e_recrutador, activo")
      .eq("activo", true)
      .eq("e_recrutador", true)
      .order("nome", { ascending: true }),
    supabase.from("atribuicoes_entrevista").select("recrutador, recrutadores"),
  ]);

  if (contasR.error) return [];

  // Conta-se a EQUIPA, não só o responsável: um segundo recrutador também
  // tem de se apresentar àquela entrevista, e a carga dele conta na mesma.
  const contagem = new Map<string, number>();
  for (const a of (atribuicoesR.data ?? []) as Atribuicao[]) {
    for (const quem of equipaDe(a)) contagem.set(quem, (contagem.get(quem) ?? 0) + 1);
  }

  return ((contasR.data ?? []) as { utilizador: string; nome: string; papel: Papel }[]).map((c) => ({
    utilizador: c.utilizador,
    nome: c.nome,
    papel: c.papel,
    atribuidos: contagem.get(c.utilizador) ?? 0,
  }));
}

/** A função de recrutador, lida agora e não do cookie. */
export async function eRecrutadorAgora(utilizador: string): Promise<boolean> {
  const { data, error } = await criarClienteServidor()
    .from("utilizadores_painel")
    .select("e_recrutador, activo")
    .eq("utilizador", utilizador)
    .limit(1);

  if (error) return false;
  const conta = (data ?? [])[0] as { e_recrutador: boolean; activo: boolean } | undefined;
  return Boolean(conta?.activo && conta.e_recrutador);
}

export interface Autorizacao {
  sessao: Sessao;
  /** Entrevista qualquer candidato, pelo papel. */
  global: boolean;
}

/**
 * O PORTÃO. Atira quando esta pessoa não pode entrevistar este candidato.
 *
 * Chamado por todas as acções de servidor do módulo. Esconder o botão no ecrã
 * não é segurança: quem souber o endereço chama a acção à mesma.
 */
export async function exigirEntrevistaDoCandidato(candidatoId: string): Promise<Autorizacao> {
  const sessao = await sessaoActual();
  if (!sessao) throw new Error("Sessão terminada. Volta a entrar no painel.");

  // Caminho largo: quem entrevista pelo papel entrevista qualquer um.
  if (pode(sessao.papel, "entrevistar")) return { sessao, global: true };

  // Caminho estreito: função de recrutador, num papel elegível, e o candidato
  // tem mesmo de estar atribuído a esta pessoa.
  if (!podeSerRecrutador(sessao.papel)) {
    throw new Error("O teu papel não permite realizar entrevistas.");
  }

  if (!(await eRecrutadorAgora(sessao.utilizador))) {
    throw new Error("Não tens a função de recrutador activa. Fala com um administrador.");
  }

  const atribuicao = await lerAtribuicao(candidatoId);

  // Qualquer um da equipa entra - é toda a razão de ser da equipa. Continua
  // a ser uma leitura fresca à base de dados, nunca o cookie de 12 horas.
  if (!estaNaEquipa(atribuicao, sessao.utilizador)) {
    throw new Error(
      "Este candidato não te está atribuído. Só podes entrevistar os candidatos da tua lista."
    );
  }

  return { sessao, global: false };
}

/** Exige o direito de GERIR entrevistas: atribuir, mudar estados, o roteiro. */
export async function exigirGestaoDeEntrevistas(): Promise<Sessao> {
  const sessao = await sessaoActual();
  if (!sessao) throw new Error("Sessão terminada. Volta a entrar no painel.");
  if (!pode(sessao.papel, "gerir_entrevistas")) {
    throw new Error("Só um administrador ou gestor pode gerir atribuições de entrevistas.");
  }
  return sessao;
}

/** Escreve no histórico. Melhor esforço: nunca deita abaixo a operação. */
export async function registarHistorico(
  candidatoId: string,
  quem: string,
  accao: string,
  detalhe?: string
): Promise<void> {
  try {
    await criarClienteServidor().from("historico_entrevista").insert({
      candidato_id: candidatoId,
      quem,
      accao,
      detalhe: detalhe ?? null,
    });
  } catch (erro) {
    console.warn("[entrevistas] não consegui escrever no histórico:", erro);
  }
}

/**
 * A mesma pergunta do portão, mas sem atirar: para as páginas decidirem o que
 * mostrar. O portão continua a ser chamado nas acções - esta função só evita
 * desenhar um botão que o servidor ia recusar.
 */
export async function podeEntrevistarCandidato(
  candidatoId: string
): Promise<{ pode: boolean; motivo: string | null }> {
  try {
    await exigirEntrevistaDoCandidato(candidatoId);
    return { pode: true, motivo: null };
  } catch (erro) {
    return { pode: false, motivo: erro instanceof Error ? erro.message : "Sem permissão." };
  }
}
