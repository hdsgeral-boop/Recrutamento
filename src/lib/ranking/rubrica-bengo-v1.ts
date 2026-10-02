import type {
  Alerta,
  Criterio,
  DadosFormulario,
  Extraccao,
  ResultadoPontuacao,
} from "@/lib/ranking/tipos";

/**
 * ===========================================================================
 * RUBRICA bengo-v1
 * ---------------------------------------------------------------------------
 * A IA extrai factos. Este ficheiro calcula a pontuação.
 *
 * Nada aqui chama rede nem base de dados: é uma função pura. O mesmo candidato
 * com os mesmos documentos dá sempre o mesmo número, e mudar um peso não
 * obriga a reprocessar documento nenhum.
 *
 * Precedência: quando o formulário e os documentos divergem, vale o
 * formulário para a pontuação, e gera-se um alerta. O candidato responde pelo
 * que declarou; o OCR pode ter lido mal.
 * ===========================================================================
 */

export const VERSAO_RUBRICA = "bengo-v1" as const;

/** Municípios onde o projecto decorre. */
export const MUNICIPIOS_PROJECTO = [
  "Caxito",
  "Dande",
  "Pango Aluquém",
  "Bula Atumba",
  "Dembos",
  "Nambuangongo",
  "Ambriz",
] as const;

/** Municípios de Luanda com acesso directo à área do projecto. */
const LUANDA_PROXIMA = ["Cacuaco", "Icolo e Bengo"] as const;

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

const NOMES: Record<keyof typeof PESOS, string> = {
  A: "Residência",
  B1: "Cadastro e recolha de dados no terreno",
  B2: "Tempo de trabalho fora de escritório",
  B3: "Registo estruturado de dados",
  B4: "Fotografia técnica",
  C: "Formação ou experiência eléctrica",
  D: "Literacia digital",
  E: "Carta de condução",
  F: "Comunicação e atendimento ao público",
  G: "Completude da candidatura",
};

/** Extracção vazia, para quando ainda não houve análise por IA. */
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

/** O nível académico declarado no formulário implica 12.ª classe? */
export function formularioDeclara12a(nivel: string): boolean {
  const n = nivel.toLowerCase();
  return (
    n.includes("12") ||
    n.includes("médio") ||
    n.includes("medio") ||
    n.includes("universit") ||
    n.includes("bacharel") ||
    n.includes("licenc") ||
    n.includes("pós") ||
    n.includes("pos-")
  );
}

// ---------------------------------------------------------------------------

interface Contexto {
  f: DadosFormulario;
  e: Extraccao;
  alertas: Alerta[];
}

const criterio = (
  codigo: keyof typeof PESOS,
  pontos: number,
  banda: string,
  evidencia: string | null,
  origem: Criterio["origem"]
): Criterio => ({
  codigo,
  nome: NOMES[codigo],
  pontos,
  maximo: PESOS[codigo],
  banda,
  evidencia,
  origem,
});

// ------------------------------------------------------- A. RESIDÊNCIA (15)

function pontuarResidencia({ f, e, alertas }: Contexto): Criterio {
  const municipio = f.municipio;
  const provincia = f.provincia;

  let pontos: number;
  let banda: string;

  if (MUNICIPIOS_PROJECTO.includes(municipio as never)) {
    pontos = 15;
    banda = "Reside num município do projecto";
  } else if (provincia === "Bengo") {
    pontos = 12;
    banda = "Reside noutro ponto do Bengo";
  } else if (LUANDA_PROXIMA.includes(municipio as never)) {
    pontos = 8;
    banda = "Reside em Cacuaco ou Icolo e Bengo";
  } else if (provincia === "Luanda") {
    pontos = 4;
    banda = "Reside noutro município de Luanda";
  } else {
    pontos = 0;
    banda = "Fora de Luanda e do Bengo";
  }

  // Natural de um município do projecto conhece o terreno e as pessoas.
  const natural = e.naturalidade.municipio;
  let evidencia: string | null = null;

  if (
    pontos < 15 &&
    natural &&
    MUNICIPIOS_PROJECTO.includes(natural as never) &&
    pontos < 12
  ) {
    const antes = pontos;
    pontos = Math.min(12, pontos + 2);
    banda += `, natural de ${natural} (+${pontos - antes})`;
    evidencia = `Natural de ${natural}`;
  }

  // O BI diz uma coisa, o formulário diz outra.
  const noBi = e.residencia_bi.municipio;
  if (noBi && noBi.toLowerCase() !== municipio.toLowerCase()) {
    alertas.push({
      tipo: "divergencia_formulario",
      mensagem: `O formulário diz ${municipio}, os documentos dizem ${noBi}. Valeu o formulário.`,
      gravidade: "aviso",
    });
  }

  return criterio("A", pontos, banda, evidencia, evidencia ? "ambos" : "formulario");
}

// ------------------------------- B1. CADASTRO E RECOLHA NO TERRENO (14)

const PONTOS_TIPO_CAMPO: Record<string, { pontos: number; banda: string }> = {
  cadastro_censo_inquerito: { pontos: 14, banda: "Cadastro, recenseamento ou inquéritos" },
  topografia_gis: { pontos: 13, banda: "Topografia, GIS ou georreferenciação" },
  leitura_contadores_fiscalizacao: {
    pontos: 10,
    banda: "Leitura de contadores, fiscalização ou vistorias",
  },
  inventario_conferencia: { pontos: 6, banda: "Inventário físico ou conferência de activos" },
};

function pontuarCadastro({ f, e }: Contexto): Criterio {
  let melhor = { pontos: 0, banda: "Nenhuma", evidencia: null as string | null };

  for (const exp of e.experiencias) {
    const tabela = exp.tipo_campo ? PONTOS_TIPO_CAMPO[exp.tipo_campo] : undefined;
    if (tabela && tabela.pontos > melhor.pontos) {
      melhor = { ...tabela, evidencia: exp.evidencia ?? `${exp.funcao} - ${exp.empresa}` };
    }
  }

  // Declarou experiência similar no formulário mas os documentos não a mostram:
  // damos o degrau mais baixo, porque a declaração vale alguma coisa.
  if (melhor.pontos === 0 && f.experiencia_similar) {
    return criterio(
      "B1",
      6,
      "Experiência similar declarada no formulário, sem detalhe nos documentos",
      null,
      "formulario"
    );
  }

  return criterio("B1", melhor.pontos, melhor.banda, melhor.evidencia, "documentos");
}

// ------------------------------------- B2. TEMPO FORA DE ESCRITÓRIO (8)

function pontuarTempoCampo({ e }: Contexto): Criterio {
  const anos = e.experiencias
    .filter((x) => x.trabalho_de_campo)
    .reduce((s, x) => s + (x.anos ?? 0), 0);

  const houveCampo = e.experiencias.some((x) => x.trabalho_de_campo);

  if (anos >= 3) return criterio("B2", 8, "3 anos ou mais de campo", `${anos} anos`, "documentos");
  if (anos >= 1) return criterio("B2", 5, "Entre 1 e 3 anos de campo", `${anos} anos`, "documentos");
  if (houveCampo)
    return criterio("B2", 2, "Menos de 1 ano ou trabalho pontual de campo", null, "documentos");

  return criterio("B2", 0, "Percurso exclusivamente de escritório", null, "documentos");
}

// ------------------------------------- B3. REGISTO ESTRUTURADO (5)

const NUCLEO_REGISTO = /confer|control|registo|registr|invent|arquiv|dados/i;

function pontuarRegisto({ e }: Contexto): Criterio {
  const nucleo = e.experiencias.find((x) => x.regista_dados && NUCLEO_REGISTO.test(x.funcao));
  if (nucleo) {
    return criterio(
      "B3",
      5,
      "Função cujo núcleo é registar ou conferir dados",
      nucleo.evidencia ?? nucleo.funcao,
      "documentos"
    );
  }

  const parcial = e.experiencias.find((x) => x.regista_dados);
  if (parcial) {
    return criterio(
      "B3",
      3,
      "Registo de dados como parte da função",
      parcial.evidencia ?? parcial.funcao,
      "documentos"
    );
  }

  return criterio("B3", 0, "Nenhum", null, "documentos");
}

// ------------------------------------- B4. FOTOGRAFIA TÉCNICA (3)

function pontuarFotografia({ e }: Contexto): Criterio {
  if (e.fotografia.nivel === "formacao")
    return criterio("B4", 3, "Formação ou experiência em fotografia", e.fotografia.evidencia, "documentos");
  if (e.fotografia.nivel === "pratica")
    return criterio("B4", 1, "Uso declarado de câmara para registo de trabalho", e.fotografia.evidencia, "documentos");
  return criterio("B4", 0, "Nenhum", null, "documentos");
}

// ------------------------------------------------- C. ELECTRICIDADE (20)

function pontuarElectricidade({ f, e, alertas }: Contexto): Criterio {
  const nos = e.electricidade.nivel;

  // O formulário só distingue "conhece MT/BT" sim ou não.
  if (f.conhece_mtbt) {
    if (nos === "mt_bt") {
      return criterio("C", 20, "Formação ou experiência em MT e BT", e.electricidade.evidencia, "ambos");
    }
    if (nos === "nenhum") {
      alertas.push({
        tipo: "divergencia_formulario",
        mensagem:
          "Declarou conhecimento de MT/BT mas os documentos não o mostram. Confirmar na entrevista.",
        gravidade: "aviso",
      });
      return criterio("C", 12, "MT/BT declarado, sem confirmação nos documentos", null, "formulario");
    }
    // Documentos mostram algo, mas menos do que MT/BT: fica o que se prova, com o mínimo do declarado.
  }

  switch (nos) {
    case "mt_bt":
      return criterio("C", 20, "Formação ou experiência em MT e BT", e.electricidade.evidencia, "documentos");
    case "bt":
      return criterio("C", 14, "Só baixa tensão", e.electricidade.evidencia, "documentos");
    case "generico":
      return criterio("C", 12, "Curso genérico de electricidade", e.electricidade.evidencia, "documentos");
    case "proximo":
      return criterio("C", 8, "Área técnica próxima", e.electricidade.evidencia, "documentos");
    default:
      return criterio("C", 0, "Nenhuma", null, "ambos");
  }
}

// ------------------------------------------------ D. LITERACIA DIGITAL (10)

function pontuarDigital({ e }: Contexto): Criterio {
  if (e.informatica.nivel === "formacao")
    return criterio("D", 10, "Formação em informática ou curso superior na área", e.informatica.evidencia, "documentos");
  if (e.informatica.nivel === "utilizador")
    return criterio("D", 6, "Uso corrente de smartphone, GPS ou aplicações", e.informatica.evidencia, "documentos");
  return criterio("D", 0, "Nenhuma evidência", null, "documentos");
}

// -------------------------------------------------------- E. CARTA (10)

const PROFISSIONAL = /profissional|pesados|categoria\s*[cde]|c1|d1/i;

function pontuarCarta({ f, e, alertas }: Contexto): Criterio {
  if (!f.tem_carta) {
    if (e.carta_conducao.tem) {
      alertas.push({
        tipo: "divergencia_formulario",
        mensagem: "Os documentos mostram carta de condução, mas o formulário diz que não tem.",
        gravidade: "info",
      });
    }
    return criterio("E", 0, "Nenhuma", null, "formulario");
  }

  const categoria = e.carta_conducao.categoria ?? "";
  if (PROFISSIONAL.test(categoria)) {
    return criterio("E", 10, `Profissional (${categoria})`, e.carta_conducao.evidencia, "ambos");
  }

  return criterio("E", 8, "Ligeiros", e.carta_conducao.evidencia, "formulario");
}

// --------------------------------------- F. COMUNICAÇÃO E ATENDIMENTO (10)

function pontuarComunicacao({ e }: Contexto): Criterio {
  const comunidade = e.experiencias.find(
    (x) => x.tipo_campo === "cadastro_censo_inquerito" || /inquérit|inquerit|comunidad|social/i.test(x.funcao)
  );

  if (comunidade) {
    return criterio(
      "F",
      10,
      "Atendimento, inquéritos ou trabalho com comunidades",
      comunidade.evidencia ?? comunidade.funcao,
      "documentos"
    );
  }

  if (e.atendimento_publico.tem) {
    return criterio(
      "F",
      6,
      "Atendimento em contexto comercial ou administrativo",
      e.atendimento_publico.evidencia,
      "documentos"
    );
  }

  return criterio("F", 0, "Nenhuma evidência", null, "documentos");
}

// ----------------------------------------------------- G. COMPLETUDE (5)

function pontuarCompletude({ f, e }: Contexto): Criterio {
  const ilegiveis = new Set(e.documentos_ilegiveis.map((d) => d.toLowerCase()));
  const legivel = (tipo: string) => !ilegiveis.has(tipo);

  let pontos = 0;
  const partes: string[] = [];

  if (f.temCv && legivel("cv")) { pontos++; partes.push("CV"); }
  if (f.temBi && legivel("bi")) { pontos++; partes.push("BI"); }
  if (f.temCertificado && legivel("certificado")) { pontos++; partes.push("Certificado"); }
  if (f.experiencia_similar && f.temComprovativoExperiencia) { pontos++; partes.push("comprovativo"); }
  if (e.incoerencias.length === 0) { pontos++; partes.push("sem incoerências"); }

  return criterio(
    "G",
    pontos,
    partes.length ? partes.join(", ") : "Documentação incompleta",
    null,
    "ambos"
  );
}

// ---------------------------------------------------------------------------
// FUNÇÃO PRINCIPAL
// ---------------------------------------------------------------------------

export function calcularPontuacao(
  formulario: DadosFormulario,
  extraccao: Extraccao
): ResultadoPontuacao {
  const alertas: Alerta[] = [];
  const ctx: Contexto = { f: formulario, e: extraccao, alertas };

  // --------------------------------------------------- eliminatório: 12.ª
  const declara12a = formularioDeclara12a(formulario.nivel_academico);
  const certificadoIlegivel = extraccao.documentos_ilegiveis
    .map((d) => d.toLowerCase())
    .includes("certificado");

  if (!extraccao.escolaridade.concluiu_12a && !declara12a) {
    return {
      versao: VERSAO_RUBRICA,
      eliminado: true,
      motivoEliminacao: "Não concluiu a 12.ª classe.",
      total: 0,
      criterios: [],
      alertas: [
        {
          tipo: "requisito_em_falta",
          mensagem: "Nem o formulário nem os documentos mostram a 12.ª classe concluída.",
          gravidade: "grave",
        },
      ],
    };
  }

  // Certificado ilegível não elimina ninguém: a culpa pode ser da digitalização.
  //
  // E quando o certificado nem sequer foi lido, isto é uma NOTA e não um
  // aviso: não há divergência nenhuma entre o que o candidato declarou e o
  // que está nos documentos, há apenas um OCR que não chegou lá.
  if (!extraccao.escolaridade.concluiu_12a && declara12a) {
    alertas.push({
      tipo: certificadoIlegivel ? "requisito_em_falta" : "divergencia_formulario",
      mensagem: certificadoIlegivel
        ? "A 12.ª classe está declarada no formulário. O certificado não foi lido automaticamente, por isso confirma-se na entrevista."
        : "A 12.ª classe está declarada no formulário mas não foi confirmada nos documentos. Por confirmar na entrevista.",
      gravidade: certificadoIlegivel ? "info" : "aviso",
    });
  }

  // NÃO se gera alerta por documento ilegível. Quando o OCR falha, a falha é
  // da leitura automática e não da candidatura; encher a ficha de avisos por
  // causa de uma fotografia tremida penaliza quem não tem culpa. A lista fica
  // guardada na extracção para quem quiser investigar.
  for (const inc of extraccao.incoerencias) {
    alertas.push({ tipo: "incoerencia_documentos", mensagem: inc, gravidade: "grave" });
  }

  const criterios = [
    pontuarResidencia(ctx),
    pontuarCadastro(ctx),
    pontuarTempoCampo(ctx),
    pontuarRegisto(ctx),
    pontuarFotografia(ctx),
    pontuarElectricidade(ctx),
    pontuarDigital(ctx),
    pontuarCarta(ctx),
    pontuarComunicacao(ctx),
    pontuarCompletude(ctx),
  ];

  const total = criterios.reduce((s, c) => s + c.pontos, 0);

  return {
    versao: VERSAO_RUBRICA,
    eliminado: false,
    motivoEliminacao: null,
    total: Math.round(total * 100) / 100,
    criterios,
    alertas,
  };
}
