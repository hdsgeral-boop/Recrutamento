import { ESCALA, type Marcacao, type Pergunta } from "@/lib/entrevista/roteiro";

/**
 * ===========================================================================
 * LER A FICHA DE PAPEL
 * ---------------------------------------------------------------------------
 * A parte que não fala com a rede: transformar o que o modelo de visão
 * devolveu numa lista de marcações em que se possa confiar.
 *
 * O MODELO NUNCA DEVOLVE A NOTA.
 * Só diz que bolas é que vê preenchidas. A nota sai da mesma função pura que
 * pontua a entrevista feita no ecrã. Se o modelo somasse, teríamos duas
 * maneiras de calcular a mesma coisa, e um dia davam números diferentes sem
 * que ninguém soubesse qual acreditar.
 *
 * TUDO PASSA POR OLHOS HUMANOS.
 * Mesmo com confiança alta, a leitura entra como PROPOSTA no ecrã do
 * entrevistador, que confirma antes de gravar. A diferença que a confiança
 * faz é o aviso: abaixo da fasquia, o painel diz quais as linhas duvidosas e
 * pede que se olhe para elas uma a uma.
 * ===========================================================================
 */

/** Abaixo disto, a linha vai marcada para revisão. */
export const CONFIANCA_MINIMA = 0.85;

export interface LinhaLida {
  codigo: string;
  marcacao: Marcacao | null;
  /** 0 a 1, como o modelo a declarou. */
  confianca: number;
  /** O que o modelo disse ter visto, para se poder auditar. */
  observado?: string | null;
}

export interface LeituraCrua {
  linhas?: unknown;
  confianca_global?: unknown;
  /** O modelo achou que era outra folha, ou não conseguiu ler nada. */
  aviso?: unknown;
}

export interface Leitura {
  /** Só as marcações, prontas a pré-preencher o ecrã. */
  respostas: Partial<Record<string, Marcacao>>;
  linhas: LinhaLida[];
  /** Linhas com confiança abaixo da fasquia, ou que não bateram com o roteiro. */
  duvidosas: LinhaLida[];
  /** Códigos que o modelo devolveu e não existem neste roteiro. */
  desconhecidos: string[];
  /** Perguntas do roteiro que o modelo não mencionou. */
  emFalta: string[];
  confiancaGlobal: number;
  aviso: string | null;
  /** Nada aproveitável. */
  vazia: boolean;
}

function marcacaoValida(v: unknown): v is Marcacao {
  return typeof v === "string" && v in ESCALA;
}

/** Aceita "bom", "Bom", "BOM", e o vazio como "não marcada". */
function normalizarMarcacao(v: unknown): Marcacao | null {
  if (v === null || v === undefined || v === "") return null;
  const t = String(v).trim().toLowerCase();
  if (t === "razoável") return "razoavel";
  if (t === "nenhuma" || t === "vazia" || t === "em branco") return null;
  return marcacaoValida(t) ? t : null;
}

function confiancaValida(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  // Alguns modelos devolvem percentagem em vez de fracção.
  const f = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, f));
}

/**
 * Transforma a resposta crua do modelo numa leitura utilizável.
 *
 * Nunca atira. Uma fotografia tremida ou uma resposta estranha devolvem uma
 * leitura vazia com um aviso, e não uma excepção a meio de uma entrevista.
 */
export function interpretarLeitura(cru: LeituraCrua, roteiro: Pergunta[]): Leitura {
  const doRoteiro = new Map(roteiro.map((p) => [p.codigo.toUpperCase(), p]));

  const vazia: Leitura = {
    respostas: {},
    linhas: [],
    duvidosas: [],
    desconhecidos: [],
    emFalta: roteiro.map((p) => p.codigo),
    confiancaGlobal: 0,
    aviso: typeof cru.aviso === "string" && cru.aviso.trim() ? cru.aviso.trim() : null,
    vazia: true,
  };

  if (!Array.isArray(cru.linhas) || cru.linhas.length === 0) {
    return { ...vazia, aviso: vazia.aviso ?? "A leitura não devolveu nenhuma linha." };
  }

  const linhas: LinhaLida[] = [];
  const desconhecidos: string[] = [];
  const vistos = new Set<string>();

  for (const bruta of cru.linhas) {
    if (!bruta || typeof bruta !== "object") continue;
    const l = bruta as Record<string, unknown>;

    const codigo = String(l.codigo ?? "").trim().toUpperCase();
    if (!codigo) continue;

    if (!doRoteiro.has(codigo)) {
      desconhecidos.push(codigo);
      continue;
    }

    // Um código repetido na resposta: fica o primeiro. Duas leituras da mesma
    // pergunta não se podem somar nem escolher à sorte.
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);

    linhas.push({
      codigo,
      marcacao: normalizarMarcacao(l.marcacao),
      confianca: confiancaValida(l.confianca),
      observado: typeof l.observado === "string" ? l.observado.slice(0, 120) : null,
    });
  }

  if (linhas.length === 0) {
    return { ...vazia, desconhecidos, aviso: vazia.aviso ?? "Nenhuma linha da folha bateu certo com o roteiro." };
  }

  const respostas: Partial<Record<string, Marcacao>> = {};
  for (const l of linhas) {
    // Só entram as marcações com confiança suficiente. Uma bola que o modelo
    // mal viu não pode entrar no ecrã como se fosse certa: quem revê olharia
    // para ela já preenchida e seguia em frente.
    if (l.marcacao && l.confianca >= CONFIANCA_MINIMA) respostas[l.codigo] = l.marcacao;
  }

  const duvidosas = linhas.filter((l) => l.confianca < CONFIANCA_MINIMA);
  const emFalta = roteiro.map((p) => p.codigo).filter((c) => !vistos.has(c.toUpperCase()));

  // A confiança global declarada pelo modelo não manda sozinha: a média das
  // linhas é mais difícil de inflacionar, e ficamos com a menor das duas.
  const media = linhas.reduce((s, l) => s + l.confianca, 0) / linhas.length;
  const declarada = confiancaValida(cru.confianca_global);
  const confiancaGlobal = declarada > 0 ? Math.min(declarada, media) : media;

  return {
    respostas,
    linhas,
    duvidosas,
    desconhecidos,
    emFalta,
    confiancaGlobal,
    aviso: typeof cru.aviso === "string" && cru.aviso.trim() ? cru.aviso.trim() : null,
    vazia: false,
  };
}

/** O que se pede ao modelo. Fica aqui para ser lido e discutido como código. */
export function instrucaoDeLeitura(roteiro: Pergunta[]): string {
  return [
    "És um leitor de fichas de entrevista preenchidas à mão.",
    "",
    "A folha tem uma tabela. Cada linha é uma pergunta, identificada por um código curto",
    "na primeira coluna (por exemplo T2, C1, E1). À direita há três círculos, por esta",
    "ordem: Bom, Razoável, Mau. O entrevistador preenche a caneta UM círculo por linha.",
    "",
    "A tua tarefa é dizer, para cada linha, qual o círculo preenchido.",
    "",
    "REGRAS",
    "- Um círculo preenchido está escurecido por dentro. Um círculo apenas riscado,",
    "  com um visto, ou com um ponto ao lado NÃO conta como preenchido com certeza:",
    "  devolve-o com confiança baixa.",
    "- Linha sem nenhum círculo preenchido: marcacao null. Isso é normal e não é erro.",
    "- Linha com mais do que um círculo preenchido: escolhe o mais escuro e põe a",
    "  confiança abaixo de 0.5.",
    "- NUNCA calcules pontuações, somas, notas ou percentagens. Não é o teu trabalho.",
    "- NUNCA inventes códigos que não vejas na folha.",
    "- A confiança é a tua certeza real sobre AQUELA linha, de 0 a 1. Não inflaciones:",
    "  uma leitura errada com confiança alta é pior do que uma incerteza declarada.",
    "",
    "Os códigos que podem aparecer nesta folha são:",
    roteiro.map((p) => p.codigo).join(", "),
    "",
    "Responde só com JSON, nesta forma exacta:",
    '{"linhas":[{"codigo":"T2","marcacao":"bom","confianca":0.97,"observado":"primeiro círculo cheio"}],',
    ' "confianca_global":0.93,',
    ' "aviso":null}',
    "",
    'marcacao é "bom", "razoavel", "mau" ou null.',
    "aviso é uma frase curta quando a fotografia está tremida, cortada, escura, ou não",
    "parece uma ficha de entrevista. Caso contrário null.",
  ].join("\n");
}
