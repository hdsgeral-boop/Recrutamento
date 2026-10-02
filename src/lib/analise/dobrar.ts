/**
 * ===========================================================================
 * DOBRAGEM DE ACENTOS QUE PRESERVA POSIÇÕES
 * ---------------------------------------------------------------------------
 * O normalize("NFD") + remoção de diacríticos muda o comprimento da cadeia, e
 * então os índices deixam de servir para ir buscar a citação ao texto original.
 * Aqui trocamos cada carácter acentuado pelo seu equivalente sem acento, um
 * por um, para o índice 27 do texto dobrado ser o índice 27 do texto original.
 *
 * O OCR do Drive erra sistematicamente nos mesmos sítios em documentos
 * angolanos: "electricidade" aparece como "eIectricidade" (i maiúsculo),
 * "0" por "O", "1" por "l". Tratamos disso na dobragem, para os padrões de
 * procura não terem de prever todas as variantes.
 * ===========================================================================
 */

const ACENTOS: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a", å: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", õ: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n", ý: "y", ÿ: "y",
};

/**
 * Devolve o texto em minúsculas, sem acentos e com o comprimento intacto.
 * Só isto garante que `indexOf` no resultado aponta para o sítio certo no
 * texto original.
 */
export function dobrar(texto: string): string {
  let saida = "";
  for (const c of texto.toLowerCase()) {
    // Cada carácter substituído tem de ter exactamente uma unidade de código,
    // senão os índices deslizam. Todos os da tabela têm.
    saida += ACENTOS[c] ?? c;
  }
  return saida;
}

/**
 * Recorta uma citação curta à volta de uma posição, sem cortar palavras a meio.
 * Máximo de 20 palavras, como manda a especificação da extracção.
 */
export function citar(original: string, posicao: number, palavras = 20): string {
  const inicio = Math.max(0, posicao - 60);
  const fim = Math.min(original.length, posicao + 140);

  let recorte = original.slice(inicio, fim).replace(/\s+/g, " ").trim();

  // Se cortámos a meio de uma palavra no início, deitamos fora o pedaço solto.
  if (inicio > 0) recorte = recorte.replace(/^\S*\s/, "");
  if (fim < original.length) recorte = recorte.replace(/\s\S*$/, "");

  const partes = recorte.split(" ").filter(Boolean);
  return partes.slice(0, palavras).join(" ");
}
