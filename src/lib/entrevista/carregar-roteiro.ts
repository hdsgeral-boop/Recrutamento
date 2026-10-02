import "server-only";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import {
  ROTEIRO_SEMENTE,
  SEMENTES,
  VERSAO_ROTEIRO,
  validarRoteiro,
  type Pergunta,
} from "@/lib/entrevista/roteiro";

/**
 * ===========================================================================
 * QUAL É O ROTEIRO EM VIGOR
 * ---------------------------------------------------------------------------
 * O roteiro vive na base de dados a partir do momento em que a equipa grava
 * alguma coisa no painel. Até lá - e sempre que a migração ainda não correu,
 * ou a linha activa não passa na validação - vale o roteiro do código.
 *
 * A REGRA É: NUNCA FICAR SEM ROTEIRO.
 * Uma entrevista a meio não pode rebentar porque a tabela não existe ou
 * porque alguém gravou lixo lá dentro. Cair para a semente é sempre melhor
 * do que uma página em branco, e o painel diz de onde veio o que está a ler.
 * ===========================================================================
 */

export interface RoteiroEmVigor {
  versao: string;
  perguntas: Pergunta[];
  /** Veio da base de dados, e não da semente do código. */
  daBaseDeDados: boolean;
  /** A tabela ainda não existe: falta correr a migração. */
  porMigrar: boolean;
  notas: string | null;
  criadoEm: string | null;
  criadoPor: string | null;
  /** Quando a linha activa não passou na validação, a razão fica aqui. */
  avisos: string[];
}

const SEMENTE: Omit<RoteiroEmVigor, "porMigrar" | "avisos"> = {
  versao: VERSAO_ROTEIRO,
  perguntas: ROTEIRO_SEMENTE,
  daBaseDeDados: false,
  notas: null,
  criadoEm: null,
  criadoPor: null,
};

interface LinhaRoteiro {
  versao: string;
  perguntas: unknown;
  notas: string | null;
  criado_em: string;
  criado_por: string | null;
}

export async function lerRoteiroEmVigor(): Promise<RoteiroEmVigor> {
  const supabase = criarClienteServidor();

  const { data, error } = await supabase
    .from("roteiros_entrevista")
    .select("versao, perguntas, notas, criado_em, criado_por")
    .eq("activo", true)
    .limit(1);

  // Tabela inexistente, permissões, rede: em qualquer dos casos a entrevista
  // continua a poder fazer-se, com as perguntas do código.
  if (error) return { ...SEMENTE, porMigrar: true, avisos: [] };

  const linha = (data ?? [])[0] as LinhaRoteiro | undefined;
  if (!linha) return { ...SEMENTE, porMigrar: false, avisos: [] };

  const perguntas = linha.perguntas as Pergunta[];
  const avisos = Array.isArray(perguntas) ? validarRoteiro(perguntas) : ["O roteiro gravado não é uma lista."];

  if (avisos.length > 0) {
    return { ...SEMENTE, porMigrar: false, avisos };
  }

  return {
    versao: linha.versao,
    perguntas,
    daBaseDeDados: true,
    porMigrar: false,
    notas: linha.notas,
    criadoEm: linha.criado_em,
    criadoPor: linha.criado_por,
    avisos: [],
  };
}

/**
 * As perguntas de uma versão concreta, para reler uma avaliação antiga com as
 * perguntas que ela mesmo usou. Devolve null quando a versão não existe na
 * base - o que acontece, legitimamente, para a versão da semente.
 */
export async function lerRoteiroDaVersao(versao: string): Promise<Pergunta[] | null> {
  // As versões que vieram do código estão congeladas aqui, e não na base.
  const doCodigo = SEMENTES[versao];
  if (doCodigo) return doCodigo;

  const { data, error } = await criarClienteServidor()
    .from("roteiros_entrevista")
    .select("perguntas")
    .eq("versao", versao)
    .limit(1);

  if (error) return null;
  const perguntas = (data ?? [])[0]?.perguntas as Pergunta[] | undefined;
  return Array.isArray(perguntas) ? perguntas : null;
}

/** Todas as versões, da mais recente para a mais antiga, para o histórico. */
export async function listarVersoes(): Promise<
  { versao: string; criado_em: string; criado_por: string | null; notas: string | null; activo: boolean }[]
> {
  const { data, error } = await criarClienteServidor()
    .from("roteiros_entrevista")
    .select("versao, criado_em, criado_por, notas, activo")
    .order("criado_em", { ascending: false })
    .limit(50);

  return error ? [] : (data ?? []) as any;
}
