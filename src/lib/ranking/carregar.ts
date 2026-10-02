import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Alerta, ResultadoPontuacao } from "@/lib/ranking/tipos";

/**
 * ===========================================================================
 * LEITURA DAS ANÁLISES
 * ---------------------------------------------------------------------------
 * Cada candidato pode ter várias linhas em analises_candidato: uma por
 * combinação de rubrica, versão do motor e conjunto de documentos. Nada se
 * apaga - é o histórico que permite explicar, meses depois, porque é que um
 * candidato tinha 38 pontos e passou a ter 76.
 *
 * Para o painel interessa a MAIS RECENTE QUE ESTEJA CONCLUÍDA. Uma tentativa
 * que ficou em erro não pode esconder a pontuação boa que já existia - foi
 * por isso que deixámos de usar a vista vw_ranking directamente, que devolve
 * sempre a linha mais recente, concluída ou não.
 * ===========================================================================
 */

export interface AnaliseDoPainel {
  candidato_id: string;
  pontuacao_total: number | null;
  pontuacao_detalhe: ResultadoPontuacao | null;
  alertas: Alerta[];
  eliminado: boolean;
  motivo_eliminacao: string | null;
  estado: string;
  criado_em: string;
}

export interface CargaDeAnalises {
  porCandidato: Map<string, AnaliseDoPainel>;
  erro: { message: string } | null;
}

export async function carregarAnalises(): Promise<CargaDeAnalises> {
  const supabase = criarClienteServidor();

  const { data, error } = await supabase
    .from("analises_candidato")
    .select(
      "candidato_id, pontuacao_total, pontuacao_detalhe, alertas, eliminado, motivo_eliminacao, estado, criado_em"
    )
    .order("criado_em", { ascending: false })
    .limit(4000);

  if (error) return { porCandidato: new Map(), erro: error };

  const porCandidato = new Map<string, AnaliseDoPainel>();

  // As linhas já vêm da mais recente para a mais antiga.
  for (const linha of (data ?? []) as AnaliseDoPainel[]) {
    const guardada = porCandidato.get(linha.candidato_id);

    // A primeira concluída ganha e não é substituída por mais nada.
    if (guardada?.estado === "concluida") continue;
    if (!guardada || linha.estado === "concluida") {
      porCandidato.set(linha.candidato_id, linha);
    }
  }

  return { porCandidato, erro: null };
}
