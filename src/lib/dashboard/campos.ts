/**
 * ===========================================================================
 * MOTOR DE AGREGAÇÃO DO DASHBOARD - TypeScript puro
 * ---------------------------------------------------------------------------
 * Um gráfico aqui são três escolhas: por que campo se reparte, o que se soma,
 * e como se desenha. Nada mais. É isso que permite dar ao utilizador um botão
 * «acrescentar gráfico» sem lhe pedir para saber SQL: escolhe o campo da
 * lista, escolhe a conta, e o gráfico nasce.
 *
 * Tudo o que está neste ficheiro é função pura sobre linhas já carregadas.
 * Não há consultas, não há rede, não há datas do sistema escondidas. É o que
 * torna o dashboard testável e o que o torna rápido: uma leitura à base de
 * dados serve todos os gráficos da página.
 * ===========================================================================
 */

import { escalaoEtario, idadeEm, ROTULO_SEXO } from "@/lib/demografia/bi";

/** Uma candidatura, reduzida ao que os gráficos precisam. */
export interface LinhaDashboard {
  id: string;
  criadoEm: string;
  estado: string | null;
  provincia: string | null;
  municipio: string | null;
  nivelAcademico: string | null;
  curso: string | null;
  experienciaSimilar: boolean | null;
  temCarta: boolean | null;
  /** Conhece redes de média e baixa tensão. É o equivalente do Bengo. */
  conheceMtBt: boolean | null;
  sexo: string | null;
  nascimento: string | null;
  /** Pontuação da análise documental, 0-100. */
  pontuacao: number | null;
  /** Nota da entrevista, 0-100. */
  notaEntrevista: number | null;
  recrutador: string | null;
}

export const CAMPOS = [
  { chave: "sexo", rotulo: "Sexo", nota: "lido do BI" },
  { chave: "escalao", rotulo: "Escalão etário", nota: "lido do BI" },
  { chave: "estado", rotulo: "Estado no funil", nota: "" },
  { chave: "municipio", rotulo: "Município", nota: "" },
  { chave: "provincia", rotulo: "Província", nota: "" },
  { chave: "nivelAcademico", rotulo: "Nível académico", nota: "" },
  { chave: "curso", rotulo: "Curso", nota: "" },
  { chave: "experienciaSimilar", rotulo: "Experiência na área", nota: "" },
  { chave: "temCarta", rotulo: "Carta de condução", nota: "" },
  { chave: "conheceMtBt", rotulo: "Conhece redes MT/BT", nota: "" },
  { chave: "faixaPontuacao", rotulo: "Faixa de pontuação", nota: "análise documental" },
  { chave: "faixaEntrevista", rotulo: "Faixa da nota da entrevista", nota: "" },
  { chave: "recrutador", rotulo: "Recrutador", nota: "" },
  { chave: "mes", rotulo: "Mês da candidatura", nota: "" },
] as const;

export type Campo = (typeof CAMPOS)[number]["chave"];

export const AGREGACOES = [
  { chave: "contagem", rotulo: "Quantos são" },
  { chave: "percentagem", rotulo: "Percentagem do total" },
  { chave: "mediaPontuacao", rotulo: "Pontuação média" },
  { chave: "mediaEntrevista", rotulo: "Nota média da entrevista" },
] as const;

export type Agregacao = (typeof AGREGACOES)[number]["chave"];

export const FEITIOS = [
  { chave: "barras", rotulo: "Barras" },
  { chave: "barrasH", rotulo: "Barras deitadas" },
  { chave: "anel", rotulo: "Anel" },
  { chave: "linha", rotulo: "Linha" },
] as const;

export type Feitio = (typeof FEITIOS)[number]["chave"];

export interface Grafico {
  id: string;
  titulo: string;
  campo: Campo;
  agregacao: Agregacao;
  feitio: Feitio;
  /** Quantas fatias mostrar antes de juntar o resto em «Outros». */
  topo: number;
}

export const SEM_VALOR = "Não indicado";

const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function sn(v: boolean | null): string {
  if (v === null || v === undefined) return SEM_VALOR;
  return v ? "Sim" : "Não";
}

function faixa(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return SEM_VALOR;
  if (n < 25) return "0-24";
  if (n < 50) return "25-49";
  if (n < 75) return "50-74";
  return "75-100";
}

/**
 * O valor pelo qual a linha é repartida.
 * Devolve sempre alguma coisa: uma candidatura sem município não desaparece
 * do gráfico, aparece em «Não indicado». Esconder os buracos dos dados é a
 * maneira mais fácil de tomar uma decisão errada com um gráfico bonito.
 */
export function valorDoCampo(l: LinhaDashboard, campo: Campo, agora: Date = new Date()): string {
  switch (campo) {
    case "sexo":
      return ROTULO_SEXO[l.sexo ?? ""] ?? SEM_VALOR;
    case "escalao":
      return escalaoEtario(idadeEm(l.nascimento, agora));
    case "estado":
      return l.estado?.trim() || SEM_VALOR;
    case "municipio":
      return l.municipio?.trim() || SEM_VALOR;
    case "provincia":
      return l.provincia?.trim() || SEM_VALOR;
    case "nivelAcademico":
      return l.nivelAcademico?.trim() || SEM_VALOR;
    case "curso":
      return l.curso?.trim() || SEM_VALOR;
    case "experienciaSimilar":
      return sn(l.experienciaSimilar);
    case "temCarta":
      return sn(l.temCarta);
    case "conheceMtBt":
      return sn(l.conheceMtBt);
    case "faixaPontuacao":
      return faixa(l.pontuacao);
    case "faixaEntrevista":
      return faixa(l.notaEntrevista);
    case "recrutador":
      return l.recrutador?.trim() || "Por atribuir";
    case "mes": {
      const d = new Date(l.criadoEm);
      if (Number.isNaN(d.getTime())) return SEM_VALOR;
      return `${MESES_CURTOS[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`;
    }
    default:
      return SEM_VALOR;
  }
}

export interface Balde {
  rotulo: string;
  /** O que se desenha. */
  valor: number;
  /** Quantas linhas caíram aqui, seja qual for a agregação. */
  quantas: number;
}

export interface Agregado {
  baldes: Balde[];
  /** Quantas linhas entraram na conta. */
  total: number;
  /** O maior valor, para escalar as barras. */
  maximo: number;
  /** Sufixo a pôr ao lado do número. */
  unidade: "" | "%" | "pts";
  /** Quantas linhas não tinham o dado preciso para esta agregação. */
  semDado: number;
}

/** Ordem fixa para os campos que têm uma ordem natural. */
const ORDEM_FIXA: Partial<Record<Campo, string[]>> = {
  escalao: ["Menor de 18", "18-24", "25-34", "35-44", "45-54", "55+", SEM_VALOR],
  faixaPontuacao: ["0-24", "25-49", "50-74", "75-100", SEM_VALOR],
  faixaEntrevista: ["0-24", "25-49", "50-74", "75-100", SEM_VALOR],
  sexo: ["Masculino", "Feminino", SEM_VALOR],
  experienciaSimilar: ["Sim", "Não", SEM_VALOR],
  temCarta: ["Sim", "Não", SEM_VALOR],
  conheceMtBt: ["Sim", "Não", SEM_VALOR],
};

/** O gráfico, pronto a desenhar. */
export function agregar(
  linhas: LinhaDashboard[],
  g: Grafico,
  agora: Date = new Date()
): Agregado {
  const grupos = new Map<string, { quantas: number; soma: number; comValor: number }>();

  const medida: keyof LinhaDashboard | null =
    g.agregacao === "mediaPontuacao"
      ? "pontuacao"
      : g.agregacao === "mediaEntrevista"
        ? "notaEntrevista"
        : null;

  let semDado = 0;

  for (const l of linhas) {
    const rotulo = valorDoCampo(l, g.campo, agora);
    const grupo = grupos.get(rotulo) ?? { quantas: 0, soma: 0, comValor: 0 };
    grupo.quantas++;

    if (medida) {
      const v = l[medida];
      if (typeof v === "number" && Number.isFinite(v)) {
        grupo.soma += v;
        grupo.comValor++;
      } else {
        semDado++;
      }
    }

    grupos.set(rotulo, grupo);
  }

  const total = linhas.length;

  let baldes: Balde[] = [...grupos.entries()].map(([rotulo, grupo]) => {
    let valor: number;
    if (g.agregacao === "contagem") valor = grupo.quantas;
    else if (g.agregacao === "percentagem")
      valor = total ? Math.round((grupo.quantas / total) * 1000) / 10 : 0;
    else valor = grupo.comValor ? Math.round((grupo.soma / grupo.comValor) * 10) / 10 : 0;

    return { rotulo, valor, quantas: grupo.quantas };
  });

  // Ordenar: ordem natural quando existe, senão do maior para o menor, com o
  // «Não indicado» sempre no fim para não roubar o primeiro lugar.
  const fixa = ORDEM_FIXA[g.campo];
  if (fixa) {
    baldes.sort((a, b) => fixa.indexOf(a.rotulo) - fixa.indexOf(b.rotulo));
  } else if (g.campo === "mes") {
    baldes.sort((a, b) => ordemMes(a.rotulo) - ordemMes(b.rotulo));
  } else {
    baldes.sort((a, b) => {
      if (a.rotulo === SEM_VALOR) return 1;
      if (b.rotulo === SEM_VALOR) return -1;
      return b.valor - a.valor || a.rotulo.localeCompare(b.rotulo, "pt");
    });
  }

  // Juntar a cauda em «Outros», mas só quando a cauda tem mais do que uma
  // categoria: um «Outros» com um elemento só esconde um nome por nada.
  const topo = Math.max(2, Math.floor(g.topo) || 8);
  if (!fixa && baldes.length > topo + 1) {
    const cabeca = baldes.slice(0, topo);
    const cauda = baldes.slice(topo);
    cabeca.push({
      rotulo: `Outros (${cauda.length})`,
      valor:
        g.agregacao === "contagem" || g.agregacao === "percentagem"
          ? Math.round(cauda.reduce((s, b) => s + b.valor, 0) * 10) / 10
          : mediaPonderada(cauda),
      quantas: cauda.reduce((s, b) => s + b.quantas, 0),
    });
    baldes = cabeca;
  }

  return {
    baldes,
    total,
    maximo: baldes.reduce((m, b) => Math.max(m, b.valor), 0),
    unidade: g.agregacao === "percentagem" ? "%" : g.agregacao === "contagem" ? "" : "pts",
    semDado,
  };
}

function mediaPonderada(baldes: Balde[]): number {
  const peso = baldes.reduce((s, b) => s + b.quantas, 0);
  if (!peso) return 0;
  return Math.round((baldes.reduce((s, b) => s + b.valor * b.quantas, 0) / peso) * 10) / 10;
}

function ordemMes(rotulo: string): number {
  const [m, a] = rotulo.split("/");
  const mes = MESES_CURTOS.indexOf(m);
  const ano = Number(a);
  if (mes < 0 || !Number.isFinite(ano)) return Number.MAX_SAFE_INTEGER;
  return ano * 12 + mes;
}

/** Os gráficos com que a página abre da primeira vez. */
export const GRAFICOS_PADRAO: Grafico[] = [
  { id: "g-sexo", titulo: "Repartição por sexo", campo: "sexo", agregacao: "contagem", feitio: "anel", topo: 8 },
  { id: "g-idade", titulo: "Escalão etário", campo: "escalao", agregacao: "contagem", feitio: "barras", topo: 8 },
  { id: "g-pontuacao", titulo: "Faixa de pontuação", campo: "faixaPontuacao", agregacao: "contagem", feitio: "barras", topo: 8 },
  { id: "g-municipio", titulo: "Município de residência", campo: "municipio", agregacao: "contagem", feitio: "barrasH", topo: 8 },
  { id: "g-carta", titulo: "Carta de condução", campo: "temCarta", agregacao: "contagem", feitio: "anel", topo: 8 },
  { id: "g-escolaridade", titulo: "Nível académico", campo: "nivelAcademico", agregacao: "contagem", feitio: "barrasH", topo: 6 },
  { id: "g-experiencia", titulo: "Pontuação média por experiência na área", campo: "experienciaSimilar", agregacao: "mediaPontuacao", feitio: "barras", topo: 8 },
];
