import {
  ESCALA,
  ROTEIRO,
  VERSAO_ROTEIRO,
  type Marcacao,
  type Pergunta,
} from "@/lib/entrevista/roteiro";
import { perguntaServe, type GrupoExperiencia } from "@/lib/entrevista/experiencia";

/**
 * ===========================================================================
 * PONTUAÇÃO DA ENTREVISTA
 * ---------------------------------------------------------------------------
 * Função pura: as mesmas marcações dão sempre o mesmo número. Não chama rede
 * nem base de dados, e é a mesma função que pontua a entrevista feita no ecrã
 * e a ficha lida em papel - senão as duas vias davam notas diferentes para a
 * mesma entrevista, e ninguém saberia qual acreditar.
 *
 * Bom vale o peso todo, Razoável metade, Mau zero.
 *
 * A NOTA É A SOMA DOS PONTOS GANHOS, EM 100.
 * Cada pergunta vale os pontos que o roteiro lhe deu, e a nota vai subindo
 * pergunta a pergunta: marcar a primeira das dezasseis, que vale 8, dá 8.
 *
 * Antes dividia-se pelo peso do que já tinha sido perguntado, e isso dava um
 * número que não queria dizer nada a meio da entrevista: a primeira pergunta
 * marcada como Bom punha logo 100 no ecrã, e a nota descia à medida que se
 * trabalhava. Quem entrevista lia aquilo como um erro - e era.
 *
 * Uma pergunta por marcar continua a NÃO contar como Mau: não soma pontos,
 * mas a avaliação fica assinalada como incompleta e diz quanto peso ficou por
 * perguntar. É a diferença entre não saber e saber que foi mau, e essa
 * diferença tem de estar à vista de quem decide.
 * ===========================================================================
 */

export type Respostas = Partial<Record<string, Marcacao>>;

export interface ResultadoEntrevista {
  versao: string;
  /** 0 a 100, arredondado à unidade. */
  nota: number;
  /** Quanto valia o que foi efectivamente perguntado. */
  pesoRespondido: number;
  /** Quanto valia o roteiro deste candidato por inteiro. 100, por regra. */
  pesoTotal: number;
  pontosObtidos: number;
  respondidas: number;
  totalPerguntas: number;
  /** Detalhe por pergunta, para guardar e para a ficha impressa. */
  detalhe: {
    codigo: string;
    marcacao: Marcacao | null;
    peso: number;
    pontos: number;
  }[];
  /** Verdadeiro quando ficaram perguntas por marcar. */
  incompleta: boolean;
}

/**
 * As perguntas são um ARGUMENTO, não uma importação fixa.
 *
 * O roteiro passou a ser editável no painel: a mesma entrevista tem de poder
 * ser pontuada com a versão que estava em vigor quando foi feita. Sem isto,
 * mudar um peso hoje mudava a nota de quem foi entrevistado o mês passado.
 * O roteiro do código fica como omissão, para quem chama sem indicar nada.
 */
export function pontuarEntrevista(
  respostas: Respostas,
  perguntas: Pergunta[] = ROTEIRO,
  versao: string = VERSAO_ROTEIRO
): ResultadoEntrevista {
  const detalhe = perguntas.map((p) => {
    const marcacao = respostas[p.codigo] ?? null;
    const pontos = marcacao ? p.peso * ESCALA[marcacao].fraccao : 0;
    return { codigo: p.codigo, marcacao, peso: p.peso, pontos };
  });

  const respondidas = detalhe.filter((d) => d.marcacao !== null);
  const pesoRespondido = respondidas.reduce((s, d) => s + d.peso, 0);
  const pontosObtidos = respondidas.reduce((s, d) => s + d.pontos, 0);
  const pesoTotal = detalhe.reduce((s, d) => s + d.peso, 0);

  // A nota são os pontos ganhos, sobre o roteiro INTEIRO deste candidato.
  //
  // Divide-se pelo peso total e não pelos 100 fixos porque o roteiro é
  // editável: enquanto alguém está a mexer nos pesos no painel, um percurso
  // pode somar 98 ou 104 por um instante, e a nota tem de continuar a ser
  // uma nota em 100 e não um número solto.
  const nota = pesoTotal > 0 ? Math.round((pontosObtidos / pesoTotal) * 100) : 0;

  return {
    versao,
    nota,
    pesoRespondido,
    pesoTotal,
    pontosObtidos: Math.round(pontosObtidos * 100) / 100,
    respondidas: respondidas.length,
    totalPerguntas: perguntas.length,
    detalhe,
    // Contra AS PERGUNTAS EM VIGOR, não contra o roteiro do código. Com um
    // roteiro de 4 perguntas, comparar com as 10 da semente marcava como
    // incompleta uma entrevista que foi feita até ao fim - e ficava assim
    // gravado.
    incompleta: respondidas.length < perguntas.length,
  };
}

/**
 * ===========================================================================
 * AS PERGUNTAS QUE CONTAM PARA ESTE CANDIDATO
 * ---------------------------------------------------------------------------
 * Ninguém responde ao roteiro inteiro. Quem tem experiência responde às
 * comuns mais as do seu percurso; quem não tem, às comuns mais as do outro.
 * Pontuar contra a lista toda dava sempre uma nota mais baixa do que a
 * verdadeira, porque punha no denominador perguntas que nunca foram feitas.
 *
 * O PERCURSO DEDUZ-SE DAS PRÓPRIAS MARCAÇÕES, quando elas o dizem.
 * Isto é o que torna o recálculo de uma entrevista antiga fiável: se alguém
 * respondeu à E1, foi entrevistado como quem tem experiência, e é assim que
 * tem de voltar a ser pontuado - mesmo que a classificação dele tenha
 * mudado entretanto por causa de um documento novo. A entrevista pontua-se
 * como foi feita, não como seria feita hoje.
 *
 * Sem marcações que o digam, vale o grupo que nos passam. Sem nada dos dois,
 * ficam só as comuns.
 * ===========================================================================
 */
export function perguntasDoCandidato(
  perguntas: Pergunta[],
  respostas: Respostas,
  grupoConhecido: GrupoExperiencia | "indeterminado" = "indeterminado"
): Pergunta[] {
  const marcadas = new Set(Object.keys(respostas).filter((c) => respostas[c]));

  let grupo: GrupoExperiencia | "indeterminado" = "indeterminado";
  for (const p of perguntas) {
    if (!marcadas.has(p.codigo)) continue;
    if (p.grupo === "com_experiencia" || p.grupo === "sem_experiencia") {
      grupo = p.grupo;
      break;
    }
  }

  if (grupo === "indeterminado") grupo = grupoConhecido;

  return perguntas.filter((p) => perguntaServe(p.grupo, grupo));
}

/** Escalões de leitura da nota. Como no ranking: sugerem, não decidem. */
export const ESCALOES_ENTREVISTA = [
  { min: 80, rotulo: "Muito bom", crachá: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300" },
  { min: 60, rotulo: "Bom", crachá: "bg-sky-100 text-sky-900 ring-1 ring-sky-300" },
  { min: 40, rotulo: "Razoável", crachá: "bg-amber-100 text-amber-900 ring-1 ring-amber-300" },
  { min: 0, rotulo: "Fraco", crachá: "bg-slate-100 text-slate-700 ring-1 ring-slate-300" },
] as const;

export function escalaoDaNota(nota: number) {
  return ESCALOES_ENTREVISTA.find((e) => nota >= e.min) ?? ESCALOES_ENTREVISTA[3];
}

export { TOTAL_ROTEIRO } from "@/lib/entrevista/roteiro";
