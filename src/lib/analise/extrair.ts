import "server-only";
import type { Extraccao } from "@/lib/ranking/tipos";
import type { TextoDocumento } from "@/lib/analise/ocr-drive";
import { extrairPrimeiroJson, fundir, sanear } from "@/lib/analise/fusao";
import { extrairPorHeuristica } from "@/lib/analise/extractor-heuristico";
import { pedirAoGemini, temChaveGemini } from "@/lib/analise/gemini";

/**
 * ===========================================================================
 * EXTRACÇÃO ESTRUTURADA - três camadas, nesta ordem
 * ---------------------------------------------------------------------------
 *  1. OCR do Google Drive          -> texto dos documentos  (sempre, grátis)
 *  2. Extractor determinístico     -> factos por dicionário (sempre, grátis)
 *  3. Modelo de linguagem          -> factos por leitura    (se houver chave)
 *
 * As camadas 2 e 3 fundem-se: o modelo ganha onde encontrou alguma coisa, a
 * heurística preenche o que ele deixou vazio. Assim aproveita-se o máximo de
 * cada documento e o sistema nunca fica parado à espera de uma chave.
 *
 * Seja qual for a camada, o resultado são APENAS factos observados, com
 * citação literal de apoio. Nunca notas, nunca comparações, nunca
 * recomendações - isso é trabalho da rubrica, em TypeScript puro, para o
 * resultado ser reproduzível e defensável perante um candidato que reclame.
 * ===========================================================================
 */

export const MODELO_ANTHROPIC = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 2000;

const PROMPT = `És um analista de recrutamento. Recebes o texto de documentos de um candidato
(CV, bilhete de identidade, certificado de habilitações, comprovativos de
experiência), extraídos por OCR e por isso possivelmente com erros de leitura.

Devolve APENAS JSON, sem markdown e sem preâmbulo, com esta forma exacta:

{
  "nome_nos_documentos": string|null,
  "bi_numero": string|null,
  "residencia_bi": { "bairro": string|null, "municipio": string|null, "provincia": string|null },
  "naturalidade": { "municipio": string|null, "provincia": string|null },
  "escolaridade": {
    "concluiu_12a": boolean,
    "curso": string|null,
    "media_final": number|null,
    "nivel_superior": string|null,
    "evidencia": string|null
  },
  "electricidade": {
    "nivel": "mt_bt" | "bt" | "generico" | "proximo" | "nenhum",
    "evidencia": string|null
  },
  "experiencias": [
    {
      "empresa": string,
      "funcao": string,
      "anos": number|null,
      "trabalho_de_campo": boolean,
      "regista_dados": boolean,
      "tipo_campo": "cadastro_censo_inquerito" | "topografia_gis" | "leitura_contadores_fiscalizacao"
                  | "inventario_conferencia" | "operacional_terreno" | "escritorio" | null,
      "evidencia": string|null
    }
  ],
  "carta_conducao": { "tem": boolean, "categoria": string|null, "evidencia": string|null },
  "informatica": { "nivel": "formacao" | "utilizador" | "nenhum", "evidencia": string|null },
  "fotografia": { "nivel": "formacao" | "pratica" | "nenhum", "evidencia": string|null },
  "atendimento_publico": { "tem": boolean, "evidencia": string|null },
  "documentos_ilegiveis": [string],
  "incoerencias": [string]
}

Regras:
- Não inventes. O que não estiver nos documentos é null, false, "nenhum" ou lista vazia.
- Cada "evidencia" é uma citação curta e literal do documento, com um máximo de 20 palavras.
- Em "incoerencias", regista divergências entre documentos: nomes diferentes,
  números de BI diferentes, datas impossíveis, anos de experiência que se sobrepõem
  de forma implausível.
- Em "electricidade", usa "proximo" para áreas técnicas vizinhas: energia solar,
  electromecânica, telecomunicações.
- O texto vem de OCR de documentos angolanos. Conta com trocas de "l" por "1",
  "O" por "0" e acentos perdidos; lê pelo sentido, não pela letra.
- Não avalies o candidato, não atribuas notas, não compares com outros candidatos,
  não recomendes nada.
- NÃO extraias idade, data de nascimento, sexo, estado civil, filiação nem
  qualquer dado que não sirva para avaliar a capacidade de fazer o trabalho.`;

export interface ResultadoExtraccao {
  extraccao: Extraccao;
  bruto: string | null;
  /** Como foi feita: "heuristico", "gemini-... + heuristico", etc. */
  modelo: string | null;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  /** Falha da camada 3. Não impede a pontuação, mas gera alerta no painel. */
  erro: string | null;
  /** Quantos factos a heurística conseguiu sozinha. */
  factosHeuristica: number;
}

/** Junta os textos, identificados por tipo, para uma só chamada. */
function montarDocumentos(documentos: TextoDocumento[]): string {
  return documentos
    .filter((d) => d.texto.trim().length > 0)
    .map(
      (d) =>
        `===== DOCUMENTO: ${d.tipo.toUpperCase()} (${d.nomeFicheiro}) =====\n${d.texto}`
    )
    .join("\n\n");
}

// -------------------------------------------------------- CAMADA 3: MODELOS

/** Anthropic, mantido para quem tiver a chave. */
async function pedirAoClaude(corpo: string) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return { texto: null, modelo: null, tokensEntrada: null, tokensSaida: null, erro: "sem chave" };

  try {
    const resposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO_ANTHROPIC,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        system: PROMPT,
        messages: [{ role: "user", content: corpo }],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text();
      return {
        texto: null,
        modelo: null,
        tokensEntrada: null,
        tokensSaida: null,
        erro: `A API da Anthropic respondeu ${resposta.status}: ${detalhe.slice(0, 180)}`,
      };
    }

    const json = (await resposta.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    return {
      texto: json.content?.find((c) => c.type === "text")?.text ?? null,
      modelo: MODELO_ANTHROPIC,
      tokensEntrada: json.usage?.input_tokens ?? null,
      tokensSaida: json.usage?.output_tokens ?? null,
      erro: null,
    };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    return { texto: null, modelo: null, tokensEntrada: null, tokensSaida: null, erro: msg.slice(0, 180) };
  }
}

/** Qual das camadas 3 está disponível, por ordem de preferência. */
export function provedorActivo(): "gemini" | "anthropic" | "nenhum" {
  if (temChaveGemini()) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "nenhum";
}

// ------------------------------------------------------------------ ENTRADA

/**
 * Extrai os factos dos documentos.
 * Nunca atira: em caso de falha do modelo devolve o que a heurística apurou,
 * com o erro anotado, para a pontuação seguir na mesma.
 */
export async function extrairFactos(documentos: TextoDocumento[]): Promise<ResultadoExtraccao> {
  // ------------------------------------------------ CAMADA 2 (corre sempre)
  const { extraccao: heuristica, factos } = extrairPorHeuristica(documentos);

  const base: ResultadoExtraccao = {
    extraccao: heuristica,
    bruto: null,
    modelo: "heuristico",
    tokensEntrada: null,
    tokensSaida: null,
    erro: null,
    factosHeuristica: factos,
  };

  const corpo = montarDocumentos(documentos);
  if (corpo.trim().length < 40) {
    return {
      ...base,
      erro: "Nenhum documento com texto legível para analisar. A pontuação usou só o formulário.",
    };
  }

  // ------------------------------------------------------------- CAMADA 3
  const provedor = provedorActivo();

  if (provedor === "nenhum") {
    return {
      ...base,
      erro:
        factos > 0
          ? null
          : "Sem GEMINI_API_KEY: a leitura foi só por dicionário e não apanhou factos nos documentos.",
    };
  }

  const r =
    provedor === "gemini" ? await pedirAoGemini(PROMPT, corpo) : await pedirAoClaude(corpo);

  if (r.erro || !r.texto) {
    return {
      ...base,
      erro: `${r.erro ?? "O modelo respondeu vazio."} A pontuação seguiu com a leitura determinística.`,
    };
  }

  try {
    const json = extrairPrimeiroJson(r.texto);
    if (!json) throw new Error("a resposta não continha nenhum objecto JSON");

    const doModelo = sanear(JSON.parse(json) as Partial<Extraccao>);

    return {
      extraccao: fundir(heuristica, doModelo),
      bruto: r.texto,
      modelo: `${r.modelo} + heuristico`,
      tokensEntrada: r.tokensEntrada,
      tokensSaida: r.tokensSaida,
      erro: null,
      factosHeuristica: factos,
    };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    return {
      ...base,
      bruto: r.texto,
      erro: `O modelo devolveu JSON inválido (${msg.slice(0, 90)}). Ficou a leitura determinística.`,
    };
  }
}
