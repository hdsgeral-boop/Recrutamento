import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import {
  PRAZO_CANDIDATURA,
  VAGAS_PREVISTAS_PADRAO,
} from "@/lib/constantes";

/**
 * ===========================================================================
 * DEFINIÇÕES DO RECRUTAMENTO
 * ---------------------------------------------------------------------------
 * O prazo, o número de vagas e o estado do formulário vivem na base de dados,
 * na tabela `concursos` (por concurso), para poderem ser configurados no painel.
 * ===========================================================================
 */

export interface Definicoes {
  /** ISO 8601. Momento em que o formulário deixa de aceitar candidaturas. */
  prazo: string;
  /** Quantos técnicos se pretende contratar. NUNCA aparece no formulário. */
  vagasPrevistas: number;
  /** Um fecho manual, antes de o prazo chegar. */
  candidaturasAbertas: boolean;
  /** O que se mostra a quem chega depois do fecho. Vazio usa o texto padrão. */
  mensagemEncerrado: string | null;
  /** Versão da rúbrica que pontua este concurso (ex.: padrao-v1). */
  rubricaVersao?: string | null;
  actualizadoEm: string | null;
  actualizadoPor: string | null;
}

export const DEFINICOES_PADRAO: Definicoes = {
  prazo: PRAZO_CANDIDATURA.toISOString(),
  vagasPrevistas: VAGAS_PREVISTAS_PADRAO,
  candidaturasAbertas: true,
  mensagemEncerrado: null,
  rubricaVersao: "padrao-v1",
  actualizadoEm: null,
  actualizadoPor: null,
};

/**
 * Lê as definições do concurso (por slug ou concurso_id).
 * Consulta primeiro a tabela `concursos` e faz fallback para a tabela legada
 * `definicoes` caso a migração ainda não tenha sido executada em produção.
 * Nunca lança erro: devolve sempre valores seguros para o formulário não falhar.
 */
export async function lerDefinicoes(concursoSlug?: string | null): Promise<Definicoes> {
  try {
    const supabase = criarClienteServidor();

    // 1. Tentar ler da tabela nova de concursos
    let query = supabase
      .from("concursos")
      .select("prazo_candidaturas, vagas_previstas, candidaturas_abertas, mensagem_encerrado, rubrica_versao, criado_em");

    if (concursoSlug) {
      query = query.eq("slug", concursoSlug);
    } else {
      query = query.order("criado_em", { ascending: false }).limit(1);
    }

    const { data: concurso, error: errConcurso } = await query.maybeSingle();

    if (!errConcurso && concurso) {
      return {
        prazo: concurso.prazo_candidaturas ?? DEFINICOES_PADRAO.prazo,
        vagasPrevistas: concurso.vagas_previstas ?? DEFINICOES_PADRAO.vagasPrevistas,
        candidaturasAbertas: concurso.candidaturas_abertas ?? true,
        mensagemEncerrado: concurso.mensagem_encerrado ?? null,
        rubricaVersao: concurso.rubrica_versao ?? "padrao-v1",
        actualizadoEm: concurso.criado_em ?? null,
        actualizadoPor: null,
      };
    }

    // 2. Fallback: tabela legada definicoes
    const { data, error } = await supabase
      .from("definicoes")
      .select(
        "prazo_candidaturas, vagas_previstas, candidaturas_abertas, mensagem_encerrado, actualizado_em, actualizado_por"
      )
      .eq("id", true)
      .maybeSingle();

    if (error || !data) return DEFINICOES_PADRAO;

    return {
      prazo: data.prazo_candidaturas ?? DEFINICOES_PADRAO.prazo,
      vagasPrevistas: data.vagas_previstas ?? DEFINICOES_PADRAO.vagasPrevistas,
      candidaturasAbertas: data.candidaturas_abertas ?? true,
      mensagemEncerrado: data.mensagem_encerrado ?? null,
      actualizadoEm: data.actualizado_em ?? null,
      actualizadoPor: data.actualizado_por ?? null,
    };
  } catch {
    return DEFINICOES_PADRAO;
  }
}

/** O formulário aceita candidaturas neste momento? */
export function aceitaCandidaturas(d: Definicoes, agora: Date = new Date()): boolean {
  if (!d.candidaturasAbertas) return false;
  const fim = new Date(d.prazo).getTime();
  if (Number.isNaN(fim)) return true;
  return agora.getTime() < fim;
}

export type MotivoFecho = "prazo" | "manual";

/** Por que razão o formulário está fechado? Devolve null se estiver aberto. */
export function motivoDoFecho(d: Definicoes, agora: Date = new Date()): MotivoFecho | null {
  if (aceitaCandidaturas(d, agora)) return null;
  if (!d.candidaturasAbertas) return "manual";
  return "prazo";
}
