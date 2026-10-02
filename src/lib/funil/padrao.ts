/**
 * ===========================================================================
 * FUNIL DE RECRUTAMENTO - valores de omissão
 * ---------------------------------------------------------------------------
 * Os degraus e os estados saem do «Gestor Piloto Bengo», onde foram pensados
 * com números reais: cada nível tem a taxa de passagem que se espera dele e a
 * razão por que se perde gente ali. Aqui são só o PONTO DE PARTIDA - o painel
 * grava por cima em Definições e nunca mais volta a este ficheiro.
 *
 * Porquê guardar a razão da perda ao lado do número: um funil que só mostra
 * «111 -> 83» não diz nada a quem tem de decidir. «Perde-se aqui a selecção
 * propriamente dita» diz. O número mede, a frase explica.
 * ===========================================================================
 */

/** Um estado por que o candidato passa. É o valor gravado em candidatos.status. */
export interface EstadoCandidato {
  /** O que fica gravado na coluna `status`. */
  chave: string;
  ordem: number;
  nome: string;
  /** Cor do crachá, em hexadecimal. */
  cor: string;
  /** O que falta fazer a quem está neste estado. */
  proximoPasso: string;
  /** Estados de saída: já não avançam no funil. */
  terminal: boolean;
  /**
   * Valores antigos que contam como este estado. É isto que deixa o sistema
   * mudar de vocabulário sem reescrever uma única linha da base de dados:
   * quem está gravado como "Pendente" aparece como Identificado, e continua a
   * ser "Pendente" no Supabase até alguém lhe mexer.
   */
  aliases: string[];
  activo: boolean;
}

/** Um degrau do funil. Agrupa um ou mais estados. */
export interface NivelFunil {
  chave: string;
  ordem: number;
  nome: string;
  /** Por que razão se perde gente deste nível para o seguinte. */
  perdeSeAqui: string;
  /**
   * Percentagem que se espera que passe do nível ANTERIOR para este.
   * O primeiro nível não tem taxa: é a porta de entrada.
   */
  taxaPrevista: number | null;
  cor: string;
  /** Chaves de estado que contam como tendo chegado aqui. */
  estados: string[];
  activo: boolean;
}

/** Sete estados, do primeiro contacto ao contrato. */
export const ESTADOS_PADRAO: EstadoCandidato[] = [
  {
    chave: "Identificado",
    ordem: 1,
    nome: "Identificado",
    cor: "#8496A6",
    proximoPasso: "contactar e marcar entrevista",
    terminal: false,
    aliases: ["Pendente"],
    activo: true,
  },
  {
    chave: "Contactado",
    ordem: 2,
    nome: "Contactado",
    cor: "#8A6208",
    proximoPasso: "entrevistar",
    terminal: false,
    aliases: [],
    activo: true,
  },
  {
    chave: "Entrevistado",
    ordem: 3,
    nome: "Entrevistado",
    cor: "#2E5C8A",
    proximoPasso: "decidir e seleccionar",
    terminal: false,
    aliases: [],
    activo: true,
  },
  {
    chave: "Seleccionado",
    ordem: 4,
    nome: "Seleccionado",
    cor: "#7A4E8F",
    proximoPasso: "fechar proposta e contratar",
    terminal: false,
    aliases: ["Aprovado"],
    activo: true,
  },
  {
    chave: "Contratado",
    ordem: 5,
    nome: "Contratado",
    cor: "#1C6B53",
    proximoPasso: "convocar para a formação",
    terminal: false,
    aliases: [],
    activo: true,
  },
  {
    chave: "Recusado",
    ordem: 6,
    nome: "Recusado",
    cor: "#A32C2C",
    proximoPasso: "-",
    terminal: true,
    aliases: ["Reprovado"],
    activo: true,
  },
  {
    chave: "Desistiu",
    ordem: 7,
    nome: "Desistiu",
    cor: "#B4553A",
    proximoPasso: "repor a vaga",
    terminal: true,
    aliases: [],
    activo: true,
  },
];

/**
 * Sete degraus. As taxas são as do piloto do Bengo e devem ser afinadas com o
 * que este recrutamento mostrar - é exactamente para isso que a coluna «taxa
 * real» existe ao lado da prevista.
 */
export const NIVEIS_PADRAO: NivelFunil[] = [
  {
    chave: "candidaturas",
    ordem: 1,
    nome: "Candidaturas",
    perdeSeAqui: "porta de entrada: tudo o que chega pelo formulário",
    taxaPrevista: null,
    cor: "#8496A6",
    estados: ["Identificado", "Contactado", "Entrevistado", "Seleccionado", "Contratado"],
    activo: true,
  },
  {
    chave: "pre_seleccao",
    ordem: 2,
    nome: "Pré-selecção",
    perdeSeAqui: "documento em falta, perfil fora da vaga ou residência fora da área",
    taxaPrevista: 55,
    cor: "#8A6208",
    estados: ["Contactado", "Entrevistado", "Seleccionado", "Contratado"],
    activo: true,
  },
  {
    chave: "entrevista",
    ordem: 3,
    nome: "Entrevista",
    perdeSeAqui: "não comparece, não atende, ou desiste ao saber as condições",
    taxaPrevista: 70,
    cor: "#2E5C8A",
    estados: ["Entrevistado", "Seleccionado", "Contratado"],
    activo: true,
  },
  {
    chave: "formacao",
    ordem: 4,
    nome: "Formação",
    perdeSeAqui: "a selecção propriamente dita, feita depois da entrevista",
    taxaPrevista: 75,
    cor: "#7A4E8F",
    estados: ["Seleccionado", "Contratado"],
    activo: true,
  },
  {
    chave: "teste_fluxo",
    ordem: 5,
    nome: "Teste de fluxo interno",
    perdeSeAqui:
      "faltas e desistências ao longo dos módulos - agrava-se por ainda não haver contrato assinado",
    taxaPrevista: 88,
    cor: "#1F7A8C",
    estados: ["Seleccionado", "Contratado"],
    activo: true,
  },
  {
    chave: "avaliacao",
    ordem: 6,
    nome: "Avaliação",
    perdeSeAqui: "não conclui os dias de terreno da avaliação",
    taxaPrevista: 95,
    cor: "#2E8B57",
    estados: ["Seleccionado", "Contratado"],
    activo: true,
  },
  {
    chave: "contratacao",
    ordem: 7,
    nome: "Contratação",
    perdeSeAqui: "não confirmado no teste de fluxo, ou recusa o contrato",
    taxaPrevista: 85,
    cor: "#1C6B53",
    estados: ["Contratado"],
    activo: true,
  },
];
