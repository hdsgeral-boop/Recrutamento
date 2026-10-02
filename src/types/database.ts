import type { NivelAcademico, Provincia, Status } from "@/lib/constantes";

/** Linha da tabela `candidatos` tal como vem do Supabase. */
export interface Candidato {
  id: string;
  concurso_id?: string;
  created_at: string;
  updated_at: string;
  nome: string;
  bi: string;
  provincia: Provincia;
  municipio: string;
  telefone: string;
  email: string;
  nivel_academico: NivelAcademico | string;
  curso: string | null;
  conhece_mtbt: boolean;
  tem_carta: boolean;
  experiencia_similar: boolean;
  experiencia_url: string | null;
  condicoes_aceites: boolean;
  status: Status;
  observacoes: string | null;
  drive_folder_url: string | null;
  drive_folder_id: string | null;
  cv_url: string | null;
  bi_url: string | null;
  certificado_url: string | null;
  arquivamento_estado: "pendente" | "concluido" | "erro";
  arquivamento_erro: string | null;

  // Entrevista
  entrevista_em: string | null;
  entrevista_local: string | null;
  entrevista_notas: string | null;
  /** Minutos previstos. Uso interno: nunca aparece em emails ao candidato. */
  entrevista_duracao_min?: number | null;
  /** Onde ficou a ficha da entrevista no Drive. */
  entrevista_drive_url?: string | null;
}

/** Tipos de email que o sistema sabe enviar. */
export type TipoEmail =
  | "confirmacao"
  | "aprovacao"
  | "entrevista"
  | "reprovacao"
  | "personalizado"
  | "rh"
  // Fases do processo, marcadas uma a uma ou em massa.
  | "formacao"
  | "teste_fluxo"
  | "reuniao"
  // Enviado depois da entrevista, quando a avaliação é guardada.
  | "agradecimento";

/** Uma marcação de fase, tal como fica em eventos_candidato. */
export interface EventoCandidato {
  id: string;
  concurso_id?: string;
  criado_em: string;
  candidato_id: string;
  fase: "entrevista" | "formacao" | "teste_fluxo" | "reuniao";
  quando: string;
  local: string;
  observacoes: string | null;
  email_enviado: boolean;
  criado_por: string | null;
}

/** Contas de acesso ao painel. */
export interface UtilizadorPainelLinha {
  id: string;
  criado_em: string;
  utilizador: string;
  nome: string;
  email: string | null;
  papel: "admin" | "gestor" | "editor" | "visualizador";
  activo: boolean;
  criado_por: string | null;
  ultimo_acesso: string | null;
}

/** Uma linha do histórico de comunicações. */
export interface EmailEnviado {
  id: string;
  concurso_id?: string;
  created_at: string;
  candidato_id: string;
  tipo: TipoEmail;
  destinatario: string;
  assunto: string;
  resumo: string | null;
  estado: "enviado" | "erro";
  erro: string | null;
  enviado_por: string | null;
}

/** Campos que a candidatura pública insere. */
export type NovoCandidato = Omit<
  Candidato,
  "id" | "created_at" | "updated_at" | "status" | "observacoes" | "drive_folder_url" | "arquivamento_estado" | "arquivamento_erro"
>;
