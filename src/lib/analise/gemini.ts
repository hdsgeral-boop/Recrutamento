import "server-only";

/**
 * ===========================================================================
 * GEMINI - o modelo da Google que lê o texto do OCR
 * ---------------------------------------------------------------------------
 * A Drive API já nos dá o texto dos documentos. O que falta é interpretá-lo,
 * e para isso usamos a API Gemini, da mesma Google. Precisa de uma chave
 * tirada em aistudio.google.com (variável GEMINI_API_KEY). O plano Google AI
 * Ultra NÃO paga esta API - a chave tem um plano gratuito próprio, que chega
 * de sobra para algumas centenas de candidaturas.
 *
 * Sem chave, nada disto corre e a análise fica-se pelo extractor
 * determinístico. O sistema nunca pára por falta de modelo.
 * ===========================================================================
 */

const RAIZ = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Modelos por ordem de preferência. O primeiro que a chave conseguir usar
 * fica guardado para as chamadas seguintes. Assim o sistema sobrevive a
 * mudanças no catálogo da Google sem ninguém ter de tocar no código.
 */
const CANDIDATOS = [
  // O alias "-latest" é o que a Google recomenda: aponta sempre para o flash
  // estável mais recente, hoje o gemini-3.8-flash, sem termos de andar a
  // actualizar esta lista de cada vez que sai um modelo novo.
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-2.0-flash",
];

/**
 * Modelos que a chave não consegue mesmo usar (404: não existem no catálogo
 * dela). Guardamos SÓ estes, e nunca o modelo que funcionou.
 *
 * A tentação é guardar o primeiro que responde e usá-lo sempre. Mas uma falha
 * passageira do modelo bom - um 429, um 503 - passaria a leitura toda para um
 * modelo mais fraco até ao fim do processo, e ninguém daria por isso. Assim,
 * cada candidatura recomeça pelo melhor modelo disponível.
 */
const inexistentes = new Set<string>();

export interface RespostaGemini {
  texto: string | null;
  modelo: string | null;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  erro: string | null;
}

interface CorpoResposta {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string; status?: string };
}

export function temChaveGemini(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_AI_API_KEY?.trim());
}

function chave(): string | null {
  return (process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_AI_API_KEY?.trim()) ?? null;
}

/** Lista de modelos a tentar: o configurado à frente, sem repetições. */
function ordemDosModelos(): string[] {
  const configurado = process.env.GEMINI_MODEL?.trim();
  const lista = configurado ? [configurado, ...CANDIDATOS] : CANDIDATOS;
  return Array.from(new Set(lista)).filter((m) => !inexistentes.has(m));
}

/** Uma tentativa contra um modelo concreto. */
async function tentar(
  modelo: string,
  sistema: string,
  utilizador: string,
  semPensamento: boolean,
  imagem?: Imagem | null
): Promise<{ estado: number; corpo: CorpoResposta }> {
  const geracao: Record<string, unknown> = {
    temperature: 0,
    // Ler uma ficha de vinte perguntas dá uma resposta maior do que extrair
    // factos de um CV, e cortar a meio devolve JSON partido.
    maxOutputTokens: imagem ? 8192 : 4096,
    responseMimeType: "application/json",
  };

  // Os modelos recentes "pensam" antes de responder e isso gasta o orçamento
  // de saída. Numa extracção de factos não acrescenta nada, por isso desliga-se.
  if (semPensamento) geracao.thinkingConfig = { thinkingBudget: 0 };

  const resposta = await fetch(`${RAIZ}/models/${modelo}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": chave() as string,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: sistema }] },
      contents: [
        {
          role: "user",
          parts: imagem
            ? [{ inline_data: { mime_type: imagem.tipo, data: imagem.base64 } }, { text: utilizador }]
            : [{ text: utilizador }],
        },
      ],
      generationConfig: geracao,
    }),
    // 60 segundos é o tecto do plano Hobby da Vercel; abortamos antes disso.
    signal: AbortSignal.timeout(45_000),
  });

  const corpo = (await resposta.json().catch(() => ({}))) as CorpoResposta;
  return { estado: resposta.status, corpo };
}

/**
 * Pede ao Gemini a interpretação do texto.
 * Nunca atira: devolve sempre o erro dentro do objecto, para a análise
 * poder continuar com o que o extractor determinístico já apurou.
 */
/** Uma imagem para o modelo ver, já em base64. */
export interface Imagem {
  /** Sem o prefixo "data:...;base64,". */
  base64: string;
  tipo: string;
}

export async function pedirAoGemini(
  sistema: string,
  utilizador: string,
  imagem?: Imagem | null
): Promise<RespostaGemini> {
  const vazio = (erro: string): RespostaGemini => ({
    texto: null,
    modelo: null,
    tokensEntrada: null,
    tokensSaida: null,
    erro,
  });

  if (!chave()) return vazio("Falta a variável GEMINI_API_KEY.");

  let ultimoErro = "Nenhum modelo do Gemini respondeu.";

  for (const modelo of ordemDosModelos()) {
    for (const semPensamento of [true, false]) {
      try {
        const { estado, corpo } = await tentar(modelo, sistema, utilizador, semPensamento, imagem);

        if (estado === 200) {
          const texto =
            corpo.candidates?.[0]?.content?.parts
              ?.map((p) => p.text ?? "")
              .join("")
              .trim() || null;

          if (!texto) {
            ultimoErro = `O modelo ${modelo} respondeu sem texto (${corpo.candidates?.[0]?.finishReason ?? "sem motivo"}).`;
            break;
          }

          return {
            texto,
            modelo,
            tokensEntrada: corpo.usageMetadata?.promptTokenCount ?? null,
            tokensSaida: corpo.usageMetadata?.candidatesTokenCount ?? null,
            erro: null,
          };
        }

        const detalhe = corpo.error?.message ?? `HTTP ${estado}`;
        ultimoErro = `${modelo}: ${detalhe.slice(0, 180)}`;

        // 400 com thinkingConfig: este modelo não conhece o campo. Repete-se
        // sem ele - é o que acontece com os "lite".
        if (estado === 400 && semPensamento) continue;

        // 401/403: a chave está errada ou sem permissão. Percorrer o catálogo
        // todo só ia dar o mesmo erro sete vezes.
        if (estado === 401 || estado === 403) return vazio(ultimoErro);

        // 404: este modelo não existe para esta chave. Fica anotado para não
        // se voltar a perder tempo com ele nesta instância.
        if (estado === 404) inexistentes.add(modelo);

        // Tudo o resto - 400 persistente, 429 de quota, 5xx de avaria - passa
        // ao modelo seguinte, que tem quota própria.
        break;
      } catch (erro) {
        const msg = erro instanceof Error ? erro.message : String(erro);
        ultimoErro = `${modelo}: ${msg.slice(0, 180)}`;
        break;
      }
    }
  }

  return vazio(ultimoErro);
}

/** Verificação rápida da chave, para o diagnóstico do painel. */
export async function testarGemini(): Promise<{ ok: boolean; mensagem: string }> {
  if (!chave()) {
    return {
      ok: true,
      mensagem:
        "Sem GEMINI_API_KEY. A análise corre só com o OCR do Drive e o extractor determinístico.",
    };
  }

  const r = await pedirAoGemini(
    'Devolve exactamente {"ok":true} e mais nada.',
    "Responde ao pedido."
  );

  return r.erro
    ? { ok: false, mensagem: r.erro }
    : { ok: true, mensagem: `Gemini a responder pelo modelo ${r.modelo}.` };
}
