/**
 * Tipos para campos configuráveis de formulários de concurso.
 */

export type TipoCampo = "texto" | "numero" | "seleccao" | "booleano" | "sim_nao";

export interface CampoFormulario {
  id?: string;
  concursoId: string;
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio: boolean;
  opcoes?: string[] | null;
  ajuda?: string | null;
  ordem: number;
}

export interface ResultadoValidacaoCampos {
  valido: boolean;
  erros: Record<string, string>;
  valores: Record<string, unknown>;
}
