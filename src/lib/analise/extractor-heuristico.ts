import { extraccaoVazia } from "@/lib/ranking/rubrica-padrao-v1";
import type { Experiencia, Extraccao, TipoCampo } from "@/lib/ranking/tipos";
import { citar, dobrar } from "@/lib/analise/dobrar";
import type { TextoDocumento } from "@/lib/analise/ocr-drive";

/**
 * ===========================================================================
 * EXTRACTOR DETERMINÍSTICO
 * ---------------------------------------------------------------------------
 * Lê o texto que o OCR do Google Drive tirou dos documentos e devolve factos,
 * sem chamar API nenhuma. É a base da análise: corre sempre, custa zero e dá
 * sempre o mesmo resultado para o mesmo texto, o que é decisivo quando um
 * candidato reclamar da posição no ranking.
 *
 * Quando houver uma chave do Gemini, o modelo corre por cima disto e o que
 * ele encontrar a mais é acrescentado (ver `fundir` em extrair.ts). O que
 * ele não encontrar fica com o que este ficheiro apanhou.
 *
 * Não extrai idade, data de nascimento, sexo, estado civil nem filiação.
 * Isso não serve para avaliar a capacidade de fazer o trabalho e por isso
 * nem sequer é lido.
 * ===========================================================================
 */

/** Um documento já dobrado, com o original ao lado para as citações. */
interface Fonte {
  tipo: TextoDocumento["tipo"];
  nome: string;
  original: string;
  dobrado: string;
}

interface Achado {
  achou: boolean;
  evidencia: string | null;
  fonte: Fonte | null;
}

const NADA: Achado = { achou: false, evidencia: null, fonte: null };

/**
 * Procura qualquer um dos termos e devolve a citação do primeiro que aparecer.
 * Os termos vêm já sem acentos e em minúsculas - a dobragem trata do resto.
 */
function procurar(fontes: Fonte[], termos: string[]): Achado {
  for (const f of fontes) {
    for (const termo of termos) {
      const pos = f.dobrado.indexOf(termo);
      if (pos !== -1) {
        return { achou: true, evidencia: citar(f.original, pos), fonte: f };
      }
    }
  }
  return NADA;
}

/** Procura por expressão regular, com a citação a sair do texto original. */
function procurarRegex(fontes: Fonte[], padrao: RegExp): (Achado & { captura: string | null }) {
  for (const f of fontes) {
    const re = new RegExp(padrao.source, padrao.flags.includes("g") ? padrao.flags : padrao.flags + "g");
    const m = re.exec(f.dobrado);
    if (m) {
      return {
        achou: true,
        evidencia: citar(f.original, m.index),
        fonte: f,
        captura: m[1] ?? m[0],
      };
    }
  }
  return { ...NADA, captura: null };
}

// ------------------------------------------------------------- DICIONÁRIOS

const ESCOLARIDADE_12A = [
  "12a classe", "12.a classe", "12ª classe", "decima segunda classe",
  "ensino medio", "tecnico medio", "curso medio", "medio tecnico",
  "ii ciclo", "2. ciclo do ensino secundario", "segundo ciclo",
  "certificado de habilitacoes", "diploma de conclusao",
  "conclusao do ensino secundario", "ensino secundario completo",
];

const ESCOLARIDADE_SUPERIOR = [
  "licenciatura", "licenciado", "bacharelato", "bacharel", "engenharia",
  "ensino superior", "universidade", "instituto superior", "mestrado",
];

/**
 * Electricidade em quatro degraus. Separamos os termos em três famílias
 * porque a leitura não é uma simples lista: "média tensão" numa frase solta
 * não prova trabalho em MT/BT, mas "posto de transformação" prova - não há
 * postos de transformação sem média e baixa tensão dos dois lados.
 */
const MT_EXPLICITO = [
  "media e baixa tensao", "media tensao e baixa tensao", "mt/bt", "mt e bt",
  "mt-bt", "mt e bt", "baixa e media tensao",
];

/** Equipamento que só existe em redes de média tensão. */
const REDE_MT = [
  "posto de transformacao", "postos de transformacao", "subestacao",
  "subestacoes", "rede de distribuicao", "redes de distribuicao",
  "linhas aereas", "transformador", "transformadores", "cabina de transformacao",
  "seccionador", "ramal de media tensao",
];

/** Menção a média ou alta tensão, sem dizer mais nada. */
const TENSAO_ALTA = ["media tensao", "alta tensao", "mt ", " mt", "media-tensao"];

const BAIXA_TENSAO = [
  "baixa tensao", "instalacoes electricas", "instalacao electrica",
  "electricista", "eletricista", "quadros electricos", "montagem electrica",
  "instalador electrico", "ramais", "contadores de energia", "bt ",
];

const ELECTRICIDADE_GENERICA = [
  "electricidade", "eletricidade", "electrotecnia", "eletrotecnia",
  "energia electrica", "electricidade industrial", "electrificacao",
];

const ELECTRICIDADE_PROXIMA = [
  "energia solar", "fotovoltaic", "electromecanica", "eletromecanica",
  "telecomunicacoes", "refrigeracao", "automacao", "mecatronica",
  "manutencao industrial", "electronica", "eletronica",
];

const CAMPO: { tipo: Exclude<TipoCampo, null>; regista: boolean; termos: string[] }[] = [
  {
    tipo: "cadastro_censo_inquerito",
    regista: true,
    termos: [
      "cadastro", "recadastramento", "censo", "recenseamento", "inquerito",
      "inqueritos", "recolha de dados", "coleta de dados", "colecta de dados",
      "levantamento de dados", "georreferenciacao", "geo-referenciacao",
      "entrevistador", "agente de terreno", "recolha de informacao",
      "inqueridor", "enumerador", "recenseador", "porta a porta",
      "visita domiciliar", "visitas domiciliarias", "recolha de assinaturas",
      "actualizacao de dados", "atualizacao de dados", "base de dados de clientes",
      "registo de clientes", "identificacao de clientes",
    ],
  },
  {
    tipo: "topografia_gis",
    regista: true,
    termos: [
      "topografia", "topografo", "geodesia", "cartografia", "arcgis", "qgis",
      "sistema de informacao geografica", " gis ", " sig ", "gps",
      "levantamento topografico", "coordenadas",
    ],
  },
  {
    tipo: "leitura_contadores_fiscalizacao",
    regista: true,
    termos: [
      "leitura de contadores", "leitor de contadores", "leitura de consumo",
      "fiscalizacao", "fiscal de obra", "inspeccao", "inspecao", "vistoria",
      "medidores", "contadores de agua", "leitura de medidores",
      "cobranca ao domicilio", "corte e religacao", "instalacao de contadores",
    ],
  },
  {
    tipo: "inventario_conferencia",
    regista: true,
    termos: [
      "inventario", "conferencia de stock", "conferente", "controlo de stock",
      "gestao de armazem", "armazem", "conferencia de material",
    ],
  },
  {
    tipo: "operacional_terreno",
    regista: false,
    termos: [
      "trabalho de campo", "trabalhos de campo", "trabalho no terreno",
      "no terreno", "em obra", "obras publicas", "montagem", "manutencao",
      "instalacao de", "operador de", "tecnico de campo", "ajudante de",
      // Ofícios que em Angola são quase sempre trabalho fora de escritório.
      "canalizador", "pedreiro", "carpinteiro", "soldador", "serralheiro",
      "mecanico", "motorista", "condutor profissional", "estafeta",
      "servente", "operario", "vigilante", "seguranca privada",
      "distribuicao de", "entrega de", "ramais de agua", "ligacao de agua",
      "construcao civil", "estaleiro", "obra de",
    ],
  },
  {
    tipo: "escritorio",
    regista: false,
    termos: [
      "escritorio", "administrativo", "secretariado", "recepcao",
      "assistente administrativo", "back office",
    ],
  },
];

const INFORMATICA_FORMACAO = [
  "curso de informatica", "informatica na optica do utilizador",
  "formacao em informatica", "tecnologias de informacao", "curso de tic",
  "engenharia informatica", "programacao", "curso de computador",
];

const INFORMATICA_UTILIZADOR = [
  "microsoft office", "ms office", "word", "excel", "powerpoint",
  "conhecimentos de informatica", "utilizador de computador", "internet",
  "smartphone", "tablet", "aplicacoes moveis", "office",
];

const FOTOGRAFIA_FORMACAO = ["curso de fotografia", "fotografo", "formacao em fotografia", "reporter de imagem"];
const FOTOGRAFIA_PRATICA = ["fotografia", "registo fotografico", "camara fotografica", "fotografar", "captura de imagens"];

const ATENDIMENTO = [
  "atendimento ao publico", "atendimento ao cliente", "atendimento a clientes",
  "recepcionista", "call center", "balcao", "apoio ao cliente",
  "servico de apoio", "relacoes publicas", "vendedor", "comercial",
];

const CARTA = [
  "carta de conducao", "carta de conducao n", "licenca de conducao",
  "titulo de conducao", "habilitado a conduzir",
];

// ------------------------------------------------------------- EXTRACTORES

function extrairEscolaridade(fontes: Fonte[]): Extraccao["escolaridade"] {
  const superior = procurar(fontes, ESCOLARIDADE_SUPERIOR);
  const doze = procurar(fontes, ESCOLARIDADE_12A);

  // "média final de 14 valores", "com 13,5 valores", "média: 14"
  const media = procurarRegex(
    fontes,
    /m[eé]dia(?:\s+final)?\s*(?:de|:|e)?\s*(\d{1,2}(?:[.,]\d)?)\s*valores?/
  );
  const mediaSolta = media.achou
    ? media
    : procurarRegex(fontes, /(\d{1,2}(?:[.,]\d)?)\s*valores/);

  // "curso de electricidade", "curso técnico de energia"
  const curso = procurarRegex(
    fontes,
    /curso(?:\s+t[eé]cnico)?(?:\s+m[eé]dio)?\s+(?:de|em|d[oa])\s+([a-z\s]{4,45}?)(?:\n|,|\.|;|\s{2})/
  );

  const cursoSuperior = procurarRegex(fontes, /(?:licenciatura|bacharelato|engenharia)\s+(?:em|de)\s+([a-z\s]{4,45}?)(?:\n|,|\.|;|\s{2})/);

  const valor = mediaSolta.captura ? Number(mediaSolta.captura.replace(",", ".")) : null;

  return {
    // O ensino superior implica necessariamente a 12.ª classe concluída.
    concluiu_12a: doze.achou || superior.achou,
    curso: curso.captura ? curso.captura.trim() : null,
    media_final: valor !== null && valor >= 5 && valor <= 20 ? valor : null,
    nivel_superior: superior.achou ? (cursoSuperior.captura?.trim() ?? "Ensino superior") : null,
    evidencia: doze.evidencia ?? superior.evidencia,
  };
}

function extrairElectricidade(fontes: Fonte[]): Extraccao["electricidade"] {
  const explicito = procurar(fontes, MT_EXPLICITO);
  const rede = procurar(fontes, REDE_MT);
  const tensaoAlta = procurar(fontes, TENSAO_ALTA);
  const baixa = procurar(fontes, BAIXA_TENSAO);

  // mt_bt em três situações: está lá escrito; há equipamento de rede que só
  // existe em média tensão; ou fala-se de média tensão E de baixa tensão.
  if (explicito.achou) return { nivel: "mt_bt", evidencia: explicito.evidencia };
  if (rede.achou) return { nivel: "mt_bt", evidencia: rede.evidencia };
  if (tensaoAlta.achou && baixa.achou) {
    return { nivel: "mt_bt", evidencia: tensaoAlta.evidencia ?? baixa.evidencia };
  }

  if (baixa.achou) return { nivel: "bt", evidencia: baixa.evidencia };

  const generica = procurar(fontes, ELECTRICIDADE_GENERICA);
  if (generica.achou) return { nivel: "generico", evidencia: generica.evidencia };

  const proxima = procurar(fontes, ELECTRICIDADE_PROXIMA);
  if (proxima.achou) return { nivel: "proximo", evidencia: proxima.evidencia };

  // Média tensão mencionada de passagem, sem mais nada à volta: vale o mínimo
  // reconhecível, não o máximo.
  if (tensaoAlta.achou) return { nivel: "generico", evidencia: tensaoAlta.evidencia };

  return { nivel: "nenhum", evidencia: null };
}

/** Anos de experiência: primeiro a declaração directa, depois os intervalos de datas. */
function extrairAnos(fontes: Fonte[]): number | null {
  const directo = procurarRegex(fontes, /(\d{1,2})\s*anos?\s+de\s+(?:experi[eê]ncia|servi[cç]o|trabalho)/);
  if (directo.captura) {
    const n = Number(directo.captura);
    if (n > 0 && n <= 45) return n;
  }

  // Intervalos "2018 - 2023", "2018 a 2023", "2018 ate 2023", "2018/2023"
  let maior = 0;
  const anoActual = new Date().getFullYear();

  for (const f of fontes) {
    const re = /(19[89]\d|20[0-4]\d)\s*(?:-|–|a|ate|\/|até)\s*(19[89]\d|20[0-4]\d|actualidade|atual|presente|hoje)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.dobrado)) !== null) {
      const inicio = Number(m[1]);
      const fim = /^\d{4}$/.test(m[2]) ? Number(m[2]) : anoActual;
      const duracao = fim - inicio;
      if (duracao > 0 && duracao <= 45) maior = Math.max(maior, duracao);
    }
  }

  return maior > 0 ? maior : null;
}

/**
 * Constrói uma experiência por cada tipo de trabalho reconhecido no texto.
 * Não tenta reconstruir o percurso profissional linha a linha - isso o OCR
 * não permite fazer com honestidade. Regista o que está lá, com a citação.
 */
function extrairExperiencias(fontes: Fonte[]): Experiencia[] {
  const anos = extrairAnos(fontes);
  const saida: Experiencia[] = [];

  for (const grupo of CAMPO) {
    const r = procurar(fontes, grupo.termos);
    if (!r.achou) continue;

    saida.push({
      empresa: "Não identificada no texto",
      funcao: grupo.termos[0].trim(),
      // Os anos apuram-se para o percurso todo, não por posto. Atribuímos ao
      // primeiro achado de campo, que é o que a rubrica usa para B2.
      anos: saida.length === 0 ? anos : null,
      trabalho_de_campo: grupo.tipo !== "escritorio",
      regista_dados: grupo.regista,
      tipo_campo: grupo.tipo,
      evidencia: r.evidencia,
    });
  }

  return saida;
}

/** "b e c" e "b, c" dão os dois "B/C"; "b" dá "B". */
function normalizarCategorias(bruto: string): string | null {
  const letras = bruto
    .split(/[,\/+]|\s+e\s+|\s+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => /^[A-E]$/.test(t));

  const unicas = Array.from(new Set(letras));
  return unicas.length ? unicas.join("/") : null;
}

function extrairCarta(fontes: Fonte[]): Extraccao["carta_conducao"] {
  const r = procurar(fontes, CARTA);
  if (!r.achou) return { tem: false, categoria: null, evidencia: null };

  // O (?![a-z]) é indispensável: sem ele, "categoria B, emitida em Luanda"
  // apanhava o "e" de "emitida" como se fosse uma segunda categoria.
  const cat = procurarRegex(
    fontes,
    /categorias?\s*:?\s*([a-e](?![a-z])(?:\s*(?:[,\/+]|e)\s*[a-e](?![a-z]))*)/
  );

  return {
    tem: true,
    categoria: cat.captura ? normalizarCategorias(cat.captura) : null,
    evidencia: r.evidencia,
  };
}

function extrairBi(fontes: Fonte[]): string | null {
  // Formato angolano: 9 dígitos, 2 letras, 3 dígitos.
  for (const f of fontes) {
    const m = /\b(\d{9}[a-z]{2}\d{3})\b/.exec(f.dobrado);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function extrairNome(fontes: Fonte[]): string | null {
  const r = procurarRegex(fontes, /nome(?:\s+completo)?\s*:\s*([a-z][a-z\s]{6,60}?)(?:\n|\d)/);
  if (!r.captura || !r.fonte) return null;

  // Devolvemos o recorte do texto ORIGINAL, para não perder as maiúsculas.
  const pos = r.fonte.dobrado.indexOf(r.captura);
  const bruto = pos === -1 ? r.captura : r.fonte.original.slice(pos, pos + r.captura.length);
  return bruto.trim().replace(/\s+/g, " ");
}

// ------------------------------------------------------------------ ENTRADA

export interface ResultadoHeuristico {
  extraccao: Extraccao;
  /** Quantos factos úteis saíram, para se saber se valeu a pena. */
  factos: number;
}

/**
 * Corre a extracção determinística sobre o texto de todos os documentos.
 * Nunca atira: no pior caso devolve a extracção vazia.
 */
export function extrairPorHeuristica(documentos: TextoDocumento[]): ResultadoHeuristico {
  const base = extraccaoVazia();

  const fontes: Fonte[] = documentos
    .filter((d) => d.texto && d.texto.trim().length > 30)
    // O CV primeiro: é o documento com mais informação por linha.
    .sort((a, b) => (a.tipo === "cv" ? -1 : b.tipo === "cv" ? 1 : 0))
    .map((d) => ({
      tipo: d.tipo,
      nome: d.nomeFicheiro,
      original: d.texto,
      dobrado: dobrar(d.texto),
    }));

  if (fontes.length === 0) {
    return {
      extraccao: {
        ...base,
        documentos_ilegiveis: documentos.map((d) => d.nomeFicheiro),
      },
      factos: 0,
    };
  }

  const escolaridade = extrairEscolaridade(fontes);
  const electricidade = extrairElectricidade(fontes);
  const experiencias = extrairExperiencias(fontes);
  const carta = extrairCarta(fontes);

  const infFormacao = procurar(fontes, INFORMATICA_FORMACAO);
  const infUtilizador = procurar(fontes, INFORMATICA_UTILIZADOR);
  const fotoFormacao = procurar(fontes, FOTOGRAFIA_FORMACAO);
  const fotoPratica = procurar(fontes, FOTOGRAFIA_PRATICA);
  const atendimento = procurar(fontes, ATENDIMENTO);

  const extraccao: Extraccao = {
    ...base,
    nome_nos_documentos: extrairNome(fontes),
    bi_numero: extrairBi(fontes),
    escolaridade,
    electricidade,
    experiencias,
    carta_conducao: carta,
    informatica: infFormacao.achou
      ? { nivel: "formacao", evidencia: infFormacao.evidencia }
      : infUtilizador.achou
        ? { nivel: "utilizador", evidencia: infUtilizador.evidencia }
        : { nivel: "nenhum", evidencia: null },
    fotografia: fotoFormacao.achou
      ? { nivel: "formacao", evidencia: fotoFormacao.evidencia }
      : fotoPratica.achou
        ? { nivel: "pratica", evidencia: fotoPratica.evidencia }
        : { nivel: "nenhum", evidencia: null },
    atendimento_publico: { tem: atendimento.achou, evidencia: atendimento.evidencia },
    documentos_ilegiveis: documentos.filter((d) => !d.legivel).map((d) => d.nomeFicheiro),
    incoerencias: [],
  };

  const factos =
    (extraccao.escolaridade.concluiu_12a ? 1 : 0) +
    (extraccao.electricidade.nivel !== "nenhum" ? 1 : 0) +
    extraccao.experiencias.length +
    (extraccao.carta_conducao.tem ? 1 : 0) +
    (extraccao.informatica.nivel !== "nenhum" ? 1 : 0) +
    (extraccao.fotografia.nivel !== "nenhum" ? 1 : 0) +
    (extraccao.atendimento_publico.tem ? 1 : 0) +
    (extraccao.bi_numero ? 1 : 0);

  return { extraccao, factos };
}
