import { normalizarSlug } from "@/lib/concurso-contexto";

export interface NovoConcursoInput {
  nome: string;
  slug?: string;
  vagaTitulo: string;
  vagaDescricao?: string;
  vagasPrevistas?: number;
  prazoCandidaturas: string;
  rubricaVersao?: string;
  modalidadePadrao?: "chamada" | "videochamada" | "presencial";
}

export interface ValidacaoConcursoResultado {
  valido: boolean;
  erros: Record<string, string> | null;
  dados?: {
    nome: string;
    slug: string;
    vagaTitulo: string;
    vagaDescricao: string | null;
    vagasPrevistas: number;
    prazoCandidaturas: string;
    rubricaVersao: string;
    modalidadePadrao: "chamada" | "videochamada" | "presencial";
  };
}

export function validarDadosConcurso(input: NovoConcursoInput): ValidacaoConcursoResultado {
  const erros: Record<string, string> = {};

  const nome = (input.nome || "").trim();
  if (nome.length < 3) {
    erros.nome = "O nome do concurso deve ter pelo menos 3 caracteres.";
  }

  let slug = normalizarSlug(input.slug || nome);
  if (slug.length < 2) {
    erros.slug = "O identificador (slug) deve ter pelo menos 2 caracteres.";
  }

  const vagaTitulo = (input.vagaTitulo || "").trim();
  if (vagaTitulo.length < 2) {
    erros.vagaTitulo = "O título da vaga deve ter pelo menos 2 caracteres.";
  }

  const vagas = Number(input.vagasPrevistas ?? 10);
  if (!Number.isInteger(vagas) || vagas < 1) {
    erros.vagasPrevistas = "O número de vagas deve ser um número inteiro positivo.";
  }

  if (Object.keys(erros).length > 0) {
    return { valido: false, erros };
  }

  // DEFEITO INTENCIONAL PARA TEST FAILURE VERIFICATION:
  // Forçar slug para "slug-estragado" para comprovar que o teste falha
  return {
    valido: true,
    erros: null,
    dados: {
      nome,
      slug,
      vagaTitulo,
      vagaDescricao: input.vagaDescricao?.trim() || null,
      vagasPrevistas: vagas,
      prazoCandidaturas: input.prazoCandidaturas || new Date(Date.now() + 86400000 * 30).toISOString(),
      rubricaVersao: input.rubricaVersao || "padrao-v1",
      modalidadePadrao: input.modalidadePadrao || "chamada",
    },
  };
}
