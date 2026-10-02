import type { Alerta, ResultadoPontuacao, TipoAlerta } from "@/lib/ranking/tipos";

/**
 * ===========================================================================
 * A LINGUAGEM VISUAL DO RANKING
 * ---------------------------------------------------------------------------
 * Escala visual, legendas, cartões de pontuação e detalhe das avaliações.
 * ===========================================================================
 */

export interface Escalao {
  /** Pontuação mínima, inclusive. */
  min: number;
  rotulo: string;
  /** Classes do crachá da pontuação. */
  cor: string;
  /** Bolinha da legenda. */
  ponto: string;
  descricao: string;
}

export const ESCALOES: Escalao[] = [
  {
    min: 75,
    rotulo: "Muito forte",
    cor: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300",
    ponto: "bg-emerald-500",
    descricao:
      "Perfil altamente qualificado com sólida formação, experiência e conformidade documental completa.",
  },
  {
    min: 60,
    rotulo: "Forte",
    cor: "bg-sky-100 text-sky-900 ring-1 ring-sky-300",
    ponto: "bg-sky-500",
    descricao:
      "Bom perfil profissional que cumpre os requisitos principais da função.",
  },
  {
    min: 45,
    rotulo: "Médio",
    cor: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
    ponto: "bg-amber-500",
    descricao:
      "Cumpre os requisitos essenciais de elegibilidade.",
  },
  {
    min: 0,
    rotulo: "Fraco",
    cor: "bg-slate-100 text-slate-700 ring-1 ring-slate-300",
    ponto: "bg-slate-400",
    descricao:
      "Poucos pontos de encontro com os requisitos ou documentação insuficiente.",
  },
];

export const ESCALAO_ELIMINADO: Escalao = {
  min: -1,
  rotulo: "Eliminado",
  cor: "bg-rose-100 text-rose-900 ring-1 ring-rose-300",
  ponto: "bg-rose-500",
  descricao:
    "Não cumpre requisitos eliminatórios definidos para a função.",
};

export const ESCALAO_POR_ANALISAR: Escalao = {
  min: -2,
  rotulo: "Por analisar",
  cor: "bg-white text-slate-500 ring-1 ring-dashed ring-slate-300",
  ponto: "bg-slate-200",
  descricao:
    "Candidatura ainda não processada pelo motor analítico.",
};

/** O escalão de uma linha do ranking. */
export function escalaoDe(total: number | null | undefined, eliminado?: boolean): Escalao {
  if (total == null) return ESCALAO_POR_ANALISAR;
  if (eliminado) return ESCALAO_ELIMINADO;
  return ESCALOES.find((e) => total >= e.min) ?? ESCALOES[ESCALOES.length - 1];
}

// --------------------------------------------------------------- AS BARRAS

export interface Barra {
  chave: string;
  rotulo: string;
  maximo: number;
  cor: string;
  descricao: string;
  /** Critérios da rubrica que a barra soma. */
  criterios: string[];
}

export const BARRAS: Barra[] = [
  {
    chave: "experiencia",
    rotulo: "Experiência Prática",
    maximo: 30,
    cor: "bg-emerald-500",
    descricao: "Soma dos critérios de experiência no terreno, recolha e registo estruturado de dados.",
    criterios: ["B1", "B2", "B3", "B4"],
  },
  {
    chave: "formacao",
    rotulo: "Qualificação e Formação",
    maximo: 20,
    cor: "bg-amber-500",
    descricao: "Qualificação técnica e formação na área de especialidade.",
    criterios: ["C"],
  },
  {
    chave: "residencia",
    rotulo: "Localização e Disponibilidade",
    maximo: 15,
    cor: "bg-sky-500",
    descricao: "Compatibilidade geográfica e disponibilidade de deslocação.",
    criterios: ["A"],
  },
];

/** Quanto vale uma barra, para um resultado concreto. */
export function valorDaBarra(detalhe: ResultadoPontuacao | null, barra: Barra): number {
  if (!detalhe || !detalhe.criterios) return 0;
  const soma = barra.criterios.reduce(
    (acc, codigo) => acc + (detalhe.criterios.find((c) => c.codigo === codigo)?.pontos ?? 0),
    0
  );
  return Math.min(barra.maximo, soma);
}

// -------------------------------------------------------------- OS ALERTAS

export const GRAVIDADES: Record<
  Alerta["gravidade"],
  { rotulo: string; cor: string; ponto: string; explicacao: string }
> = {
  grave: {
    rotulo: "Grave",
    cor: "bg-rose-100 text-rose-800 ring-1 ring-rose-300",
    ponto: "bg-rose-500",
    explicacao:
      "Divergência importante entre os dados declarados e os documentos oficiais.",
  },
  aviso: {
    rotulo: "Aviso",
    cor: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
    ponto: "bg-amber-500",
    explicacao:
      "Documento com menor legibilidade ou detalhe que requer conferência humana.",
  },
  info: {
    rotulo: "Nota",
    cor: "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
    ponto: "bg-slate-400",
    explicacao:
      "Observação relevante para o processo de seleção e entrevista.",
  },
};

export const DESCRICAO_ALERTA: Record<TipoAlerta, string> = {
  divergencia_formulario: "O dado inserido difere do lido no documento oficial.",
  requisito_em_falta: "Falta comprovativo de um requisito para pontuação.",
  documento_ilegivel: "Ficheiro com leitura parcial ou baixa resolução.",
  ficheiro_duplicado: "O mesmo ficheiro foi enviado em mais de um campo.",
  incoerencia_documentos: "Divergência entre datas ou dados dos anexos.",
  pdf_truncado: "Ficheiro PDF incompleto ou truncado.",
  sem_extraccao: "Não foi possível extrair dados dos documentos.",
};

export const TIPOS_DE_ALERTA: { tipo: TipoAlerta; nome: string; gravidade: Alerta["gravidade"] }[] = [
  { tipo: "divergencia_formulario", nome: "Divergência com o formulário", gravidade: "grave" },
  { tipo: "requisito_em_falta", nome: "Requisito em falta", gravidade: "aviso" },
  { tipo: "documento_ilegivel", nome: "Documento ilegível", gravidade: "aviso" },
  { tipo: "ficheiro_duplicado", nome: "Ficheiro duplicado", gravidade: "aviso" },
  { tipo: "incoerencia_documentos", nome: "Incoerência entre documentos", gravidade: "aviso" },
  { tipo: "pdf_truncado", nome: "PDF truncado", gravidade: "aviso" },
  { tipo: "sem_extraccao", nome: "Sem extracção", gravidade: "info" },
];

export function contarAlertas(alertas: Alerta[] | undefined | null): {
  graves: number;
  avisos: number;
  total: number;
  dominante: Alerta["gravidade"];
} {
  if (!alertas || alertas.length === 0) {
    return { graves: 0, avisos: 0, total: 0, dominante: "info" };
  }
  let graves = 0;
  let avisos = 0;
  for (const a of alertas) {
    if (a.gravidade === "grave") graves++;
    else if (a.gravidade === "aviso") avisos++;
  }
  const dominante: Alerta["gravidade"] = graves > 0 ? "grave" : avisos > 0 ? "aviso" : "info";
  return { graves, avisos, total: alertas.length, dominante };
}
