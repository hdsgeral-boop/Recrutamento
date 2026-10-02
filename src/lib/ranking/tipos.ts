/**
 * Formas dos dados que atravessam a análise.
 * A IA preenche `Extraccao`. O código calcula `ResultadoPontuacao`.
 */

export type NivelElectricidade = "mt_bt" | "bt" | "generico" | "proximo" | "nenhum";
export type TipoCampo =
  | "cadastro_censo_inquerito"
  | "topografia_gis"
  | "leitura_contadores_fiscalizacao"
  | "inventario_conferencia"
  | "operacional_terreno"
  | "escritorio"
  | null;

export interface Experiencia {
  empresa: string;
  funcao: string;
  anos: number | null;
  trabalho_de_campo: boolean;
  regista_dados: boolean;
  tipo_campo: TipoCampo;
  evidencia: string | null;
}

/** O JSON que o modelo devolve. Factos, nunca juízos. */
export interface Extraccao {
  nome_nos_documentos: string | null;
  bi_numero: string | null;
  residencia_bi: { bairro: string | null; municipio: string | null; provincia: string | null };
  naturalidade: { municipio: string | null; provincia: string | null };
  escolaridade: {
    concluiu_12a: boolean;
    curso: string | null;
    media_final: number | null;
    nivel_superior: string | null;
    evidencia: string | null;
  };
  electricidade: { nivel: NivelElectricidade; evidencia: string | null };
  experiencias: Experiencia[];
  carta_conducao: { tem: boolean; categoria: string | null; evidencia: string | null };
  informatica: { nivel: "formacao" | "utilizador" | "nenhum"; evidencia: string | null };
  fotografia: { nivel: "formacao" | "pratica" | "nenhum"; evidencia: string | null };
  atendimento_publico: { tem: boolean; evidencia: string | null };
  documentos_ilegiveis: string[];
  incoerencias: string[];
}

/** Os campos do formulário que entram na pontuação. Mais fiáveis do que o OCR. */
export interface DadosFormulario {
  provincia: string;
  municipio: string;
  tem_carta: boolean;
  conhece_mtbt: boolean;
  experiencia_similar: boolean;
  nivel_academico: string;
  curso: string | null;
  temCv: boolean;
  temBi: boolean;
  temCertificado: boolean;
  temComprovativoExperiencia: boolean;
}

export type CodigoCriterio = "A" | "B1" | "B2" | "B3" | "B4" | "C" | "D" | "E" | "F" | "G";

export interface Criterio {
  codigo: CodigoCriterio;
  nome: string;
  pontos: number;
  maximo: number;
  /** A linha da tabela da rubrica que se aplicou. */
  banda: string;
  evidencia: string | null;
  origem: "formulario" | "documentos" | "ambos";
}

export type TipoAlerta =
  | "requisito_em_falta"
  | "documento_ilegivel"
  | "ficheiro_duplicado"
  | "divergencia_formulario"
  | "incoerencia_documentos"
  | "pdf_truncado"
  | "sem_extraccao";

export interface Alerta {
  tipo: TipoAlerta;
  mensagem: string;
  gravidade: "info" | "aviso" | "grave";
}

export interface ResultadoPontuacao {
  versao: string;
  /** Motor que leu os documentos. Preenchido na gravação, não na rubrica. */
  motor?: string;
  eliminado: boolean;
  motivoEliminacao: string | null;
  total: number;
  criterios: Criterio[];
  alertas: Alerta[];
}
