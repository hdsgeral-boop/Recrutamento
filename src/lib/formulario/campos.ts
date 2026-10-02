import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { CampoFormulario } from "@/types/formulario";

export const CAMPOS_PADRAO_GERAL: CampoFormulario[] = [
  {
    concursoId: "geral",
    chave: "disponibilidade_imediata",
    rotulo: "Tens disponibilidade imediata para início de funções?",
    tipo: "sim_nao",
    obrigatorio: true,
    ajuda: "Capacidade para integrar a equipa conforme as necessidades do projecto.",
    ordem: 1,
  },
  {
    concursoId: "geral",
    chave: "experiencia_relevante",
    rotulo: "Possuis experiência prévia relevante para a função?",
    tipo: "sim_nao",
    obrigatorio: true,
    ajuda: "Experiência em funções semelhantes ou áreas afins.",
    ordem: 2,
  },
];

// Alias para retrocompatibilidade
export const CAMPOS_PADRAO_BENGO = CAMPOS_PADRAO_GERAL;

/**
 * Lê os campos configurados para o formulário de um concurso.
 * Se a tabela ainda não tiver campos configurados pelo utilizador, devolve a lista padrão geral.
 */
export async function obterCamposFormulario(concursoId: string): Promise<CampoFormulario[]> {
  try {
    const supabase = criarClienteServidor();
    const { data, error } = await supabase
      .from("formulario_campos")
      .select("id, concurso_id, chave, rotulo, tipo, obrigatorio, opcoes, ajuda, ordem")
      .eq("concurso_id", concursoId)
      .order("ordem", { ascending: true });

    if (error || !data || data.length === 0) {
      return CAMPOS_PADRAO_GERAL;
    }

    return data.map((d) => ({
      id: d.id,
      concursoId: d.concurso_id,
      chave: d.chave,
      rotulo: d.rotulo,
      tipo: d.tipo,
      obrigatorio: d.obrigatorio,
      opcoes: d.opcoes,
      ajuda: d.ajuda,
      ordem: d.ordem,
    }));
  } catch {
    return CAMPOS_PADRAO_GERAL;
  }
}
