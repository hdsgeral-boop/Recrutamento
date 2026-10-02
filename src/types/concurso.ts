/**
 * Tipos fundamentais da plataforma de recrutamento multi-concurso.
 * Um concurso é uma linha na base de dados com o seu próprio endereço,
 * dados isolados e parâmetros operacionais.
 */

export type EstadoConcurso = "rascunho" | "aberto" | "fechado" | "arquivado";

export type PapelMembro = "admin" | "gestor" | "editor" | "visualizador";

export interface Organizacao {
  id: string;
  criadaEm: string;
  nome: string;
  nif: string | null;
  logotipoUrl: string | null;
  corPrincipal: string;
  site: string | null;
}

export interface Concurso {
  id: string;
  organizacaoId: string;
  slug: string;
  dominio: string | null;
  nome: string;
  vagaTitulo: string;
  vagaDescricao: string | null;
  estado: EstadoConcurso;

  // Prazos e metas
  prazoCandidaturas: string | null;
  vagasPrevistas: number;
  candidaturasAbertas: boolean;
  mensagemEncerrado: string | null;

  // Versões de motor
  rubricaVersao: string;
  roteiroId: string | null;

  // Janela e formato de entrevistas
  janelaAbertura: string;
  janelaFecho: string;
  duracaoEntrevistaMin: number;
  descansoMin: number;
  modalidadePadrao: "videochamada" | "chamada" | "presencial";

  // Comunicações
  remetenteNome: string;
  remetenteEmail: string | null;
  enderecoResposta: string | null;

  // Google Drive
  pastaDriveId: string | null;
  pastaDriveNome: string | null;

  // Estruturas analíticas JSON e configurações dinâmicas
  funil?: unknown;
  estados?: unknown;
  graficos?: unknown;
  rubricaConfig?: unknown;
  roteiroConfig?: unknown;

  criadoEm: string;
}

export interface Membro {
  id: string;
  utilizadorId: string;
  concursoId: string;
  papel: PapelMembro;
  eRecrutador: boolean;
  criadoEm: string;
}
