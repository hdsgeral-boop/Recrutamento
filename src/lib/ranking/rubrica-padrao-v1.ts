import type {
  Alerta,
  Criterio,
  DadosFormulario,
  Extraccao,
  ResultadoPontuacao,
} from "@/lib/ranking/tipos";

/**
 * ===========================================================================
 * RÚBRICA UNIVERSAL PADRÃO (padrao-v1) - Consulvolt
 * ---------------------------------------------------------------------------
 * Rúbrica de 100 pontos para avaliação de candidaturas a qualquer vaga.
 * Totalmente configurável, pura e determinística.
 * ===========================================================================
 */

export const VERSAO_RUBRICA = "padrao-v1" as const;

export const PESOS = Object.freeze({
  A: 15,
  B1: 14,
  B2: 8,
  B3: 5,
  B4: 3,
  C: 20,
  D: 10,
  E: 10,
  F: 10,
  G: 5,
});

export const TOTAL_MAXIMO = Object.values(PESOS).reduce((s, n) => s + n, 0); // 100

export const NOMES: Record<keyof typeof PESOS, string> = {
  A: "Residência e disponibilidade geográfica",
  B1: "Experiência prática relevante na função",
  B2: "Tempo de trabalho de campo e operacional",
  B3: "Registo e tratamento estruturado de dados",
  B4: "Registo fotográfico e evidências técnicas",
  C: "Formação académica ou técnica especializada",
  D: "Literacia digital e utilização de ferramentas",
  E: "Carta de condução e habilitações legais",
  F: "Comunicação e relacionamento interpessoal",
  G: "Completude e integridade documental",
};

/** Extracção vazia para quando ainda não houve processamento por OCR/IA. */
export function extraccaoVazia(): Extraccao {
  return {
    nome_nos_documentos: null,
    bi_numero: null,
    residencia_bi: { bairro: null, municipio: null, provincia: null },
    naturalidade: { municipio: null, provincia: null },
    escolaridade: {
      concluiu_12a: false,
      curso: null,
      media_final: null,
      nivel_superior: null,
      evidencia: null,
    },
    electricidade: { nivel: "nenhum", evidencia: null },
    experiencias: [],
    carta_conducao: { tem: false, categoria: null, evidencia: null },
    informatica: { nivel: "nenhum", evidencia: null },
    fotografia: { nivel: "nenhum", evidencia: null },
    atendimento_publico: { tem: false, evidencia: null },
    documentos_ilegiveis: [],
    incoerencias: [],
  };
}

export function formularioDeclara12a(nivel: string): boolean {
  const n = nivel.toLowerCase();
  return (
    n.includes("12") ||
    n.includes("médio") ||
    n.includes("medio") ||
    n.includes("frequência") ||
    n.includes("frequencia") ||
    n.includes("bacharelato") ||
    n.includes("licenciatura") ||
    n.includes("pós") ||
    n.includes("pos") ||
    n.includes("mestrado") ||
    n.includes("doutoramento")
  );
}

export function pontuarA(formulario: DadosFormulario): Criterio {
  const max = PESOS.A;
  let pontos = 10;
  let banda = "Residência em província com cobertura de recrutamento.";

  if (formulario.municipio && formulario.provincia) {
    pontos = max;
    banda = `Residente em ${formulario.municipio} (${formulario.provincia}).`;
  }

  return {
    codigo: "A",
    nome: NOMES.A,
    pontos,
    maximo: max,
    banda,
    evidencia: formulario.municipio || formulario.provincia || null,
    origem: "formulario",
  };
}

export function pontuarB1(formulario: DadosFormulario, extraccao: Extraccao): Criterio {
  const max = PESOS.B1;
  let pontos = 0;
  let banda = "Sem experiência na área declarada.";

  const temExp = formulario.experiencia_similar || (extraccao.experiencias?.length ?? 0) > 0;
  if (temExp) {
    pontos = max;
    banda = "Experiência prévia relevante confirmada.";
  }

  return {
    codigo: "B1",
    nome: NOMES.B1,
    pontos,
    maximo: max,
    banda,
    evidencia: temExp ? "Declarado no formulário ou comprovado em documentos" : null,
    origem: "ambos",
  };
}

export function pontuarB2(extraccao: Extraccao): Criterio {
  const max = PESOS.B2;
  const anos = extraccao.experiencias?.reduce((acc, e) => acc + (e.anos ?? 0), 0) ?? 0;
  const pontos = anos > 1 ? max : anos > 0 ? 5 : 2;

  return {
    codigo: "B2",
    nome: NOMES.B2,
    pontos,
    maximo: max,
    banda: anos > 0 ? `${anos} anos acumulados de experiência profissional.` : "Início de carreira / Júnior.",
    evidencia: anos > 0 ? `${anos} anos` : null,
    origem: "documentos",
  };
}

export function pontuarB3(formulario: DadosFormulario, extraccao: Extraccao): Criterio {
  const max = PESOS.B3;
  const temRegisto = extraccao.experiencias?.some((e) => e.regista_dados) || formulario.experiencia_similar;
  const pontos = temRegisto ? max : 2;

  return {
    codigo: "B3",
    nome: NOMES.B3,
    pontos,
    maximo: max,
    banda: temRegisto ? "Experiência comprovada em registo e recolha de dados." : "Aptidão para treino na função.",
    evidencia: temRegisto ? "Registo de dados documentado" : null,
    origem: "ambos",
  };
}

export function pontuarB4(extraccao: Extraccao): Criterio {
  const max = PESOS.B4;
  const foto = extraccao.fotografia?.nivel;
  const pontos = foto === "formacao" ? max : foto === "pratica" ? 2 : 1;

  return {
    codigo: "B4",
    nome: NOMES.B4,
    pontos,
    maximo: max,
    banda: foto !== "nenhum" ? "Prática em registo visual / fotográfico." : "Aptidão para captação móvel.",
    evidencia: extraccao.fotografia?.evidencia ?? null,
    origem: "documentos",
  };
}

export function pontuarC(formulario: DadosFormulario, extraccao: Extraccao): Criterio {
  const max = PESOS.C;
  const nivel = (formulario.nivel_academico || "").toLowerCase();
  let pontos = 12;
  let banda = "Nível médio geral ou técnico.";

  if (nivel.includes("licenciatura") || nivel.includes("pós") || nivel.includes("pos")) {
    pontos = max;
    banda = "Ensino Superior / Licenciatura.";
  } else if (nivel.includes("frequência") || nivel.includes("bacharelato") || nivel.includes("técnico")) {
    pontos = 16;
    banda = "Frequência universitária ou ensino técnico especializado.";
  }

  if (extraccao.escolaridade.concluiu_12a && pontos < max) {
    pontos = Math.min(max, pontos + 2);
    banda += " Certificado comprova conclusão.";
  }

  return {
    codigo: "C",
    nome: NOMES.C,
    pontos,
    maximo: max,
    banda,
    evidencia: formulario.curso || extraccao.escolaridade.curso || null,
    origem: "ambos",
  };
}

export function pontuarD(extraccao: Extraccao): Criterio {
  const max = PESOS.D;
  const nivel = extraccao.informatica?.nivel;
  const pontos = nivel === "formacao" ? max : nivel === "utilizador" ? 7 : 4;

  return {
    codigo: "D",
    nome: NOMES.D,
    pontos,
    maximo: max,
    banda: nivel === "formacao" ? "Formação específica em informática." : "Utilizador autónomo de sistemas.",
    evidencia: extraccao.informatica?.evidencia ?? null,
    origem: "documentos",
  };
}

export function pontuarE(formulario: DadosFormulario, extraccao: Extraccao): Criterio {
  const max = PESOS.E;
  const temCarta = formulario.tem_carta || extraccao.carta_conducao?.tem;
  const pontos = temCarta ? max : 2;

  return {
    codigo: "E",
    nome: NOMES.E,
    pontos,
    maximo: max,
    banda: temCarta ? "Possui carta de condução válida." : "Sem carta de condução assinalada.",
    evidencia: temCarta ? (extraccao.carta_conducao?.categoria ?? "Carta declarada") : null,
    origem: "ambos",
  };
}

export function pontuarF(extraccao: Extraccao): Criterio {
  const max = PESOS.F;
  const temAtend = extraccao.atendimento_publico?.tem;
  const pontos = temAtend ? max : 5;

  return {
    codigo: "F",
    nome: NOMES.F,
    pontos,
    maximo: max,
    banda: temAtend ? "Experiência comprovada em comunicação / atendimento." : "Perfil de comunicação regular.",
    evidencia: extraccao.atendimento_publico?.evidencia ?? null,
    origem: "documentos",
  };
}

export function pontuarG(formulario: DadosFormulario, extraccao: Extraccao): Criterio {
  const max = PESOS.G;
  let pontos: number = max;
  let banda = "Dossier de candidatura completo e legível.";

  if (extraccao.documentos_ilegiveis && extraccao.documentos_ilegiveis.length > 0) {
    pontos = Math.max(1, max - 3);
    banda = `Documentos assinalados com ilegibilidade (${extraccao.documentos_ilegiveis.join(", ")}).`;
  }

  return {
    codigo: "G",
    nome: NOMES.G,
    pontos,
    maximo: max,
    banda,
    evidencia: null,
    origem: "ambos",
  };
}

/**
 * Função principal pura que calcula a pontuação universal do candidato.
 */
export function calcularPontuacao(
  formulario: DadosFormulario,
  extraccao: Extraccao
): ResultadoPontuacao {
  const alertas: Alerta[] = [];

  const criterios: Criterio[] = [
    pontuarA(formulario),
    pontuarB1(formulario, extraccao),
    pontuarB2(extraccao),
    pontuarB3(formulario, extraccao),
    pontuarB4(extraccao),
    pontuarC(formulario, extraccao),
    pontuarD(extraccao),
    pontuarE(formulario, extraccao),
    pontuarF(extraccao),
    pontuarG(formulario, extraccao),
  ];

  if (extraccao.incoerencias && extraccao.incoerencias.length > 0) {
    for (const inc of extraccao.incoerencias) {
      alertas.push({
        tipo: "incoerencia_documentos",
        gravidade: "aviso",
        mensagem: inc,
      });
    }
  }

  if (extraccao.documentos_ilegiveis && extraccao.documentos_ilegiveis.length > 0) {
    alertas.push({
      tipo: "documento_ilegivel",
      gravidade: "aviso",
      mensagem: `Documentos com leitura parcial: ${extraccao.documentos_ilegiveis.join(", ")}`,
    });
  }

  const total = Math.min(
    TOTAL_MAXIMO,
    criterios.reduce((soma, c) => soma + c.pontos, 0)
  );

  return {
    versao: VERSAO_RUBRICA,
    total,
    eliminado: false,
    motivoEliminacao: null,
    criterios,
    alertas,
  };
}
