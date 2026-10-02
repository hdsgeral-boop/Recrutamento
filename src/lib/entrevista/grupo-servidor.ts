import "server-only";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import {
  CRITERIO_EXPERIENCIA,
  classificarExperiencia,
  type GrupoExperiencia,
} from "@/lib/entrevista/experiencia";
import type { Candidato } from "@/types/database";

/**
 * ===========================================================================
 * O PERCURSO DE UM CANDIDATO, VISTO DO SERVIDOR
 * ---------------------------------------------------------------------------
 * A mesma decisão que o painel mostra no ecrã, feita outra vez do lado de cá.
 *
 * Existe porque a nota gravada tem de ser calculada contra o percurso certo,
 * e o servidor não pode acreditar no que o browser lhe diga sobre isso: o
 * percurso decide quais são as perguntas que contam, e portanto decide a
 * nota. Um número que vem do browser nunca é a fonte de verdade de uma
 * avaliação, e o percurso é parte desse número.
 *
 * A ordem é a mesma de sempre: a correcção manual manda, depois o critério B
 * da rubrica, depois o que a pessoa declarou.
 * ===========================================================================
 */
export async function grupoDoCandidato(
  candidato: Candidato
): Promise<GrupoExperiencia | "indeterminado"> {
  const supabase = criarClienteServidor();

  const [{ data: atribuicoes }, { data: analises }] = await Promise.all([
    supabase
      .from("atribuicoes_entrevista")
      .select("grupo_manual")
      .eq("candidato_id", candidato.id)
      .limit(1),
    supabase
      .from("analises_candidato")
      .select("pontuacao_detalhe, estado, criado_em")
      .eq("candidato_id", candidato.id)
      .eq("estado", "concluida")
      .order("criado_em", { ascending: false })
      .limit(1),
  ]);

  const manual = (atribuicoes ?? [])[0]?.grupo_manual ?? null;

  const criterios = ((analises ?? [])[0]?.pontuacao_detalhe as
    | { criterios?: { codigo: string; pontos: number; maximo: number }[] }
    | null)?.criterios;
  const b = criterios?.find((x) => x.codigo === CRITERIO_EXPERIENCIA) ?? null;

  return classificarExperiencia({
    manual,
    criterio: b ? { pontos: b.pontos, maximo: b.maximo } : null,
    declarou: candidato.experiencia_similar ?? null,
  }).grupo;
}
