/**
 * ===========================================================================
 * COM EXPERIÊNCIA OU SEM EXPERIÊNCIA
 * ---------------------------------------------------------------------------
 * As perguntas mudam conforme o candidato já tenha feito trabalho de cadastro
 * ou não. Perguntar "conta-me um dia típico de recolha porta a porta" a quem
 * nunca fez é perder a pergunta; não a fazer a quem já fez é perder a melhor
 * prova que a entrevista podia dar.
 *
 * A CLASSIFICAÇÃO SAI DOS DADOS QUE JÁ EXISTEM.
 * Não há uma pergunta nova a pedir à equipa que classifique cada pessoa à
 * mão. Usa-se, por esta ordem:
 *
 *   1. A correcção manual, quando alguém discordou da leitura automática.
 *   2. O critério B da rubrica - cadastro, censo, inquérito ou recolha de
 *      dados no terreno - que já foi pontuado a partir dos documentos.
 *   3. O que o próprio declarou no formulário (experiencia_similar).
 *
 * Quando nenhuma destas fontes existe, o resultado é "indeterminado" e o
 * painel pede uma validação humana, em vez de adivinhar. Adivinhar aqui é
 * caro: põe o candidato a responder ao conjunto errado de perguntas e depois
 * compara-se a nota dele com a de quem respondeu ao outro.
 * ===========================================================================
 */

export const GRUPOS = ["com_experiencia", "sem_experiencia"] as const;
export type GrupoExperiencia = (typeof GRUPOS)[number];

/** O grupo a que uma PERGUNTA pertence. "ambos" é o valor de omissão. */
export const GRUPOS_PERGUNTA = ["ambos", "com_experiencia", "sem_experiencia"] as const;
export type GrupoPergunta = (typeof GRUPOS_PERGUNTA)[number];

export const NOME_GRUPO: Record<GrupoPergunta, string> = {
  ambos: "Todos os candidatos",
  com_experiencia: "Só com experiência",
  sem_experiencia: "Só sem experiência",
};

/**
 * O critério da rubrica que mede experiência de terreno, e a fasquia.
 *
 * Um terço do máximo. Abaixo disso, a rubrica encontrou no máximo uma
 * menção solta - o que não chega para tratar a pessoa como experiente e
 * fazer-lhe perguntas que pressupõem um método já formado.
 *
 * No Bengo o critério chama-se B1, "Cadastro e recolha de dados no terreno",
 * e vale 14 pontos. No UGP é o B. O código é o único sítio onde isso importa.
 */
export const CRITERIO_EXPERIENCIA = "B1";
export const FRACCAO_MINIMA = 1 / 3;

export interface EntradaClassificacao {
  /** Correcção feita por uma pessoa. Manda sempre. */
  manual?: GrupoExperiencia | null;
  /** Pontos e máximo do critério B da última análise concluída. */
  criterio?: { pontos: number; maximo: number } | null;
  /** O que o candidato declarou no formulário. */
  declarou?: boolean | null;
}

export interface Classificacao {
  grupo: GrupoExperiencia | "indeterminado";
  /** De onde veio a decisão, para o painel poder explicar-se. */
  origem: "manual" | "rubrica" | "formulario" | "nenhuma";
  /** Uma frase curta a dizer porquê. */
  porque: string;
}

export function classificarExperiencia(e: EntradaClassificacao): Classificacao {
  if (e.manual === "com_experiencia" || e.manual === "sem_experiencia") {
    return {
      grupo: e.manual,
      origem: "manual",
      porque: "Corrigido à mão por alguém da equipa.",
    };
  }

  const c = e.criterio;
  if (c && Number.isFinite(c.pontos) && Number.isFinite(c.maximo) && c.maximo > 0) {
    const fraccao = c.pontos / c.maximo;
    const comExperiencia = fraccao >= FRACCAO_MINIMA;
    return {
      grupo: comExperiencia ? "com_experiencia" : "sem_experiencia",
      origem: "rubrica",
      porque: `A análise deu ${c.pontos} de ${c.maximo} no critério de recolha de dados no terreno.`,
    };
  }

  if (e.declarou === true || e.declarou === false) {
    return {
      grupo: e.declarou ? "com_experiencia" : "sem_experiencia",
      origem: "formulario",
      porque: e.declarou
        ? "O candidato declarou experiência semelhante no formulário. Ainda não há análise dos documentos."
        : "O candidato não declarou experiência semelhante, e ainda não há análise dos documentos.",
    };
  }

  return {
    grupo: "indeterminado",
    origem: "nenhuma",
    porque: "Não há análise nem declaração. Escolhe o grupo antes de entrevistar.",
  };
}

/** Uma pergunta serve este candidato? */
export function perguntaServe(
  grupoDaPergunta: GrupoPergunta | undefined | null,
  grupoDoCandidato: GrupoExperiencia | "indeterminado"
): boolean {
  const g = grupoDaPergunta ?? "ambos";
  if (g === "ambos") return true;
  // Com o grupo por decidir, mostram-se só as perguntas comuns: é o conjunto
  // que não depende de uma decisão que ainda ninguém tomou.
  if (grupoDoCandidato === "indeterminado") return false;
  return g === grupoDoCandidato;
}
