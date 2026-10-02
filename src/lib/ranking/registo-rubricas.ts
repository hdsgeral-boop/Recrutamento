import type {
  DadosFormulario,
  Extraccao,
  ResultadoPontuacao,
} from "@/lib/ranking/tipos";
import {
  calcularPontuacao as calcularPadraoV1,
  extraccaoVazia as extraccaoVaziaPadraoV1,
  PESOS as PESOS_PADRAO,
  TOTAL_MAXIMO as TOTAL_PADRAO,
} from "@/lib/ranking/rubrica-padrao-v1";

export interface RubricaAvaliacao {
  versao: string;
  nome: string;
  descricao?: string;
  totalMaximo: number;
  pesos: Readonly<Record<string, number>>;
  municipiosProjecto?: readonly string[];
  calcularPontuacao: (
    formulario: DadosFormulario,
    extraccao: Extraccao
  ) => ResultadoPontuacao;
  extraccaoVazia: () => Extraccao;
}

export const rubricaPadraoV1: RubricaAvaliacao = {
  versao: "padrao-v1",
  nome: "Rúbrica Universal Consulvolt v1",
  descricao: "Rúbrica geral de 100 pontos para avaliação de competências, formação e experiência profissional.",
  totalMaximo: TOTAL_PADRAO,
  pesos: PESOS_PADRAO,
  municipiosProjecto: [],
  calcularPontuacao: (formulario, extraccao) => ({
    ...calcularPadraoV1(formulario, extraccao),
    versao: "padrao-v1",
  }),
  extraccaoVazia: extraccaoVaziaPadraoV1,
};

export const rubricaBengoV1: RubricaAvaliacao = {
  versao: "bengo-v1",
  nome: "Rúbrica Bengo v1 (Compatibilidade)",
  descricao: "Rúbrica de compatibilidade delegada para a rúbrica universal.",
  totalMaximo: TOTAL_PADRAO,
  pesos: PESOS_PADRAO,
  municipiosProjecto: [],
  calcularPontuacao: (formulario, extraccao) => ({
    ...calcularPadraoV1(formulario, extraccao),
    versao: "bengo-v1",
  }),
  extraccaoVazia: extraccaoVaziaPadraoV1,
};

export const REGISTO_RUBRICAS: Record<string, RubricaAvaliacao> = {
  "bengo-v1": rubricaBengoV1,
  "padrao-v1": rubricaPadraoV1,
};

export function obterRubrica(versao?: string | null): RubricaAvaliacao {
  if (!versao || !REGISTO_RUBRICAS[versao]) {
    return REGISTO_RUBRICAS["padrao-v1"];
  }
  return REGISTO_RUBRICAS[versao];
}

export function listarRubricas(): { versao: string; nome: string; totalMaximo: number }[] {
  return Object.values(REGISTO_RUBRICAS).map((r) => ({
    versao: r.versao,
    nome: r.nome,
    totalMaximo: r.totalMaximo,
  }));
}
