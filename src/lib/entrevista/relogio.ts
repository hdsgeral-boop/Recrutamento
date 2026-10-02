/**
 * ===========================================================================
 * O RELÓGIO DA ENTREVISTA
 * ---------------------------------------------------------------------------
 * Conta para trás a partir do momento em que a entrevista começou.
 *
 * PORQUE CONTA PARA TRÁS E NÃO PARA A FRENTE
 * Um cronómetro a subir obriga a fazer a subtracção de cabeça enquanto se
 * ouve alguém falar. Um relógio a descer responde à única pergunta que
 * interessa a meio de uma entrevista: quanto tempo ainda tenho.
 *
 * PORQUE NÃO PÁRA NO ZERO
 * Passar do tempo não é um erro - é uma informação. Uma entrevista que
 * correu bem alonga-se, e quem a conduz deve saber quanto. Por isso o relógio
 * continua, em negativo, e muda de cor em vez de desaparecer.
 *
 * MAS PÁRA QUANDO A ENTREVISTA ACABA.
 * Passar do tempo é informação; contar para sempre não é. Uma entrevista
 * guardada ontem a marcar -940:12 não diz nada a ninguém e faz o painel
 * parecer avariado. A partir do momento em que a entrevista é dada por
 * concluída, o relógio congela no tempo que ela durou - que é o número que
 * interessa a quem a for ler depois.
 *
 * Função pura, para poder ser testada sem esperar meia hora.
 * ===========================================================================
 */

export interface EstadoRelogio {
  /** Segundos que faltam. Negativo quando já passou do tempo. */
  segundos: number;
  /** "12:34", ou "-03:05" depois de esgotado. */
  texto: string;
  /** Quanto do tempo já correu, de 0 a 1. Trava em 1 para a barra não sair. */
  fraccao: number;
  fase: "a-correr" | "a-acabar" | "esgotado";
  /** Nada foi definido: não há duração, ou a entrevista ainda não começou. */
  inactivo: boolean;
  /** A entrevista acabou: isto já não é uma contagem, é o tempo que durou. */
  parado: boolean;
  /** Segundos que a entrevista durou, do início ao fim. Só quando parado. */
  duracaoReal: number | null;
}

/** Abaixo disto, o relógio avisa. Cinco minutos é o que dá para fechar. */
export const SEGUNDOS_DE_AVISO = 5 * 60;

const PARADO: EstadoRelogio = {
  segundos: 0,
  texto: "--:--",
  fraccao: 0,
  fase: "a-correr",
  inactivo: true,
  parado: false,
  duracaoReal: null,
};

export function estadoDoRelogio(
  inicioIso: string | null | undefined,
  duracaoMinutos: number | null | undefined,
  agora: number = Date.now(),
  /** Quando a entrevista foi dada por concluída. A partir daqui não conta mais. */
  fimIso?: string | null
): EstadoRelogio {
  if (!inicioIso || !duracaoMinutos || duracaoMinutos <= 0) return PARADO;

  const inicio = new Date(inicioIso).getTime();
  if (Number.isNaN(inicio)) return PARADO;

  // O fim substitui o "agora". Uma entrevista acabada não continua a correr,
  // e um fim inválido ou anterior ao início ignora-se em vez de dar um tempo
  // negativo que ninguém sabe ler.
  const fim = fimIso ? new Date(fimIso).getTime() : NaN;
  const acabou = Number.isFinite(fim) && fim >= inicio;
  const instante = acabou ? fim : agora;

  const total = duracaoMinutos * 60;
  const corridos = Math.max(0, Math.floor((instante - inicio) / 1000));
  const segundos = total - corridos;

  return {
    segundos,
    // Parada, mostra-se o tempo que durou. A contar, mostra-se o que falta.
    texto: acabou ? formatar(corridos) : formatar(segundos),
    // Trava em 0 e em 1: uma barra com -20% ou 130% desenha-se fora da caixa.
    fraccao: Math.min(1, Math.max(0, corridos / total)),
    fase: segundos <= 0 ? "esgotado" : segundos <= SEGUNDOS_DE_AVISO ? "a-acabar" : "a-correr",
    inactivo: false,
    parado: acabou,
    duracaoReal: acabou ? corridos : null,
  };
}

/** Segundos para "MM:SS", com sinal quando já passou. */
export function formatar(segundos: number): string {
  const negativo = segundos < 0;
  const abs = Math.abs(segundos);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${negativo ? "-" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
