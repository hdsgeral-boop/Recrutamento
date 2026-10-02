/**
 * ===========================================================================
 * LEITURA DO BILHETE DE IDENTIDADE - sexo e data de nascimento
 * ---------------------------------------------------------------------------
 * PORQUE É QUE ISTO EXISTE, E ONDE É QUE PÁRA
 *
 * O painel precisa de saber a repartição por sexo e por idade para quem
 * decide sobre contratações poder ver o que está a construir. Esses dois
 * factos estão no BI, que o candidato já carregou e que o OCR do Drive já
 * leu: não se pede nada de novo a ninguém e não se gasta uma única chamada
 * ao modelo - lê-se o texto que já está em `documentos_texto`.
 *
 * A REGRA QUE NÃO SE QUEBRA: o que sai daqui serve para CONTAR, nunca para
 * PONTUAR. Sexo e idade não entram na rubrica, não entram no ranking, não
 * entram no prompt do modelo e não aparecem em lado nenhum candidato a
 * candidato fora da ficha. Só aparecem somados, no Dashboard. Um sistema que
 * pontuasse alguém pela idade ou pelo sexo seria discriminação, e além disso
 * estragava a própria medida que se quer ter.
 *
 * O número do BI angolano (9 dígitos + 2 letras + 3 dígitos) NÃO codifica o
 * sexo nem a data de nascimento. Por isso nada aqui é adivinhado a partir do
 * número, nem do nome próprio: ou está escrito no documento, ou fica vazio.
 * ===========================================================================
 */

export type Sexo = "M" | "F";

export interface LeituraBi {
  sexo: Sexo | null;
  /** AAAA-MM-DD, ou null. */
  nascimento: string | null;
  /** O que se encontrou e o que não se encontrou, para o painel ser honesto. */
  notas: string[];
}

/** Idades fora deste intervalo são erro de leitura, não pessoas. */
const IDADE_MINIMA = 14;
const IDADE_MAXIMA = 80;

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** Tira acentos e baixa tudo, para o OCR não ter de acertar nos acentos. */
function simples(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function valida(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * O sexo, só quando está escrito ao pé da palavra que o nomeia.
 *
 * O "M" e o "F" isolados aparecem por todo o lado num BI digitalizado - na
 * morada, no nome do pai, num carimbo. Por isso exige-se a etiqueta e uma
 * distância curta: é a diferença entre ler e adivinhar.
 */
export function lerSexo(texto: string): Sexo | null {
  const t = simples(texto);

  // "sexo: masculino", "sexo m", "sex0: f"
  // O OCR troca o «o» por zero e o «x» por «k» com frequência suficiente
  // para valer a pena aceitar as duas trocas na etiqueta.
  const m = t.match(/\bse[xk][o0a]?\s*[:.\-]?\s*(masculino|feminino|m|f)\b/);
  if (m) {
    const v = m[1];
    if (v === "masculino" || v === "m") return "M";
    if (v === "feminino" || v === "f") return "F";
  }

  // Alguns modelos escrevem a palavra por extenso numa linha só.
  if (/(^|\n)\s*masculino\s*($|\n)/.test(t)) return "M";
  if (/(^|\n)\s*feminino\s*($|\n)/.test(t)) return "F";

  return null;
}

/**
 * A data de nascimento, só quando está ancorada na etiqueta.
 *
 * Um BI tem três datas - nascimento, emissão e validade - e as outras duas
 * são muito mais recentes. Apanhar "a primeira data que aparece" daria a data
 * de emissão a metade das pessoas, e ninguém daria por isso porque o número
 * continuaria a parecer uma data. Daí a âncora obrigatória.
 */
export function lerNascimento(texto: string, agora: Date = new Date()): string | null {
  const t = simples(texto);

  const etiqueta =
    /(?:data\s*(?:de|do)?\s*nasc\w*|nascid[oa]\s*(?:a|em)?|nasc\.?|d\.?\s*nasc\w*)\s*[:.\-]?\s*/;

  const numerica = new RegExp(
    etiqueta.source + /(\d{1,2})\s*[\/\-. ]\s*(\d{1,2})\s*[\/\-. ]\s*(\d{2,4})/.source
  );
  const extenso = new RegExp(
    etiqueta.source + /(\d{1,2})\s*(?:de\s*)?([a-z]{3,9})\s*(?:de\s*)?(\d{4})/.source
  );

  const candidatas: string[] = [];

  const n = t.match(numerica);
  if (n) {
    let ano = Number(n[3]);
    // Um ano de dois dígitos num BI é sempre do século passado.
    if (ano < 100) ano += ano <= 30 ? 2000 : 1900;
    const d = valida(ano, Number(n[2]), Number(n[1]));
    if (d) candidatas.push(d);
  }

  const e = t.match(extenso);
  if (e) {
    const mes = MESES[e[2]];
    if (mes) {
      const d = valida(Number(e[3]), mes, Number(e[1]));
      if (d) candidatas.push(d);
    }
  }

  for (const d of candidatas) {
    const anos = idadeEm(d, agora);
    if (anos !== null && anos >= IDADE_MINIMA && anos <= IDADE_MAXIMA) return d;
  }

  return null;
}

/** Lê o que houver, e diz o que não conseguiu ler. */
export function lerBi(texto: string, agora: Date = new Date()): LeituraBi {
  if (!texto || texto.trim().length < 20) {
    return { sexo: null, nascimento: null, notas: ["O texto do BI está vazio ou é curto demais."] };
  }

  const sexo = lerSexo(texto);
  const nascimento = lerNascimento(texto, agora);
  const notas: string[] = [];

  if (!sexo) notas.push("Não encontrei o sexo escrito no documento.");
  if (!nascimento) notas.push("Não encontrei uma data de nascimento credível no documento.");

  return { sexo, nascimento, notas };
}

/** Idade em anos completos. */
export function idadeEm(nascimento: string | null, quando: Date = new Date()): number | null {
  if (!nascimento || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return null;
  const [a, m, d] = nascimento.split("-").map(Number);
  const nasceu = new Date(Date.UTC(a, m - 1, d));
  if (Number.isNaN(nasceu.getTime())) return null;

  let anos = quando.getUTCFullYear() - a;
  const mesAgora = quando.getUTCMonth() + 1;
  const diaAgora = quando.getUTCDate();
  if (mesAgora < m || (mesAgora === m && diaAgora < d)) anos--;

  return anos >= 0 && anos <= 120 ? anos : null;
}

export const ESCALOES = ["18-24", "25-34", "35-44", "45-54", "55+"] as const;
export type Escalao = (typeof ESCALOES)[number] | "Menor de 18" | "Não indicado";

/** Escalão etário, para o gráfico não ter uma barra por cada ano de idade. */
export function escalaoEtario(idade: number | null): Escalao {
  if (idade === null) return "Não indicado";
  if (idade < 18) return "Menor de 18";
  if (idade <= 24) return "18-24";
  if (idade <= 34) return "25-34";
  if (idade <= 44) return "35-44";
  if (idade <= 54) return "45-54";
  return "55+";
}

export const ROTULO_SEXO: Record<string, string> = {
  M: "Masculino",
  F: "Feminino",
  "": "Não indicado",
};
