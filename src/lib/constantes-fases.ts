/**
 * ===========================================================================
 * FASES DO PROCESSO
 * ---------------------------------------------------------------------------
 * As quatro convocatórias que a equipa faz aos candidatos. Cada uma tem o seu
 * email, a sua cor e o seu texto de omissão, para marcar cinquenta pessoas de
 * uma vez não obrigar a escrever cinquenta vezes o mesmo.
 * ===========================================================================
 */

export const FASES = ["entrevista", "formacao", "teste_fluxo", "reuniao"] as const;
export type Fase = (typeof FASES)[number];

export interface DefinicaoFase {
  rotulo: string;
  /** Como aparece no assunto do email. */
  assunto: string;
  /** Frase de abertura do email. */
  abertura: string;
  /** Título da caixa destacada com a data. */
  destaque: string;
  /** Instruções de omissão, editáveis antes de enviar. */
  notas: string;
  /** Cor da faixa do email e do crachá no painel. */
  cor: string;
  crachá: string;
  /** Estado para que o candidato transita, quando faz sentido. */
  estadoSugerido: string | null;
}

export const DEFINICOES_FASE: Record<Fase, DefinicaoFase> = {
  entrevista: {
    rotulo: "Entrevista",
    assunto: "Entrevista marcada",
    abertura:
      "A tua candidatura foi seleccionada e queremos conhecer-te pessoalmente. Ficas convocado para a entrevista.",
    destaque: "Entrevista marcada",
    notas:
      "Traz o Bilhete de Identidade original e uma cópia do Certificado de Habilitações. Chega 10 minutos antes da hora marcada.",
    cor: "#16a34a",
    crachá: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
    estadoSugerido: "Contactado",
  },
  formacao: {
    rotulo: "Formação",
    assunto: "Convocatória para a formação",
    abertura:
      "Estás convocado para a formação do projecto. A presença é obrigatória para quem seguir para o terreno.",
    destaque: "Formação marcada",
    notas:
      "Traz o Bilhete de Identidade, caderno e caneta. A formação começa à hora marcada e não há entrada depois do início.",
    cor: "#7c3aed",
    crachá: "bg-violet-100 text-violet-800 ring-1 ring-violet-300",
    estadoSugerido: null,
  },
  teste_fluxo: {
    rotulo: "Teste de Fluxo",
    assunto: "Convocatória para o teste de fluxo",
    abertura:
      "Estás convocado para o teste de fluxo, onde vais executar no terreno o que foi dado na formação.",
    destaque: "Teste de fluxo marcado",
    notas:
      "Traz o Bilhete de Identidade e o telemóvel carregado. Usa calçado fechado e roupa adequada a trabalho de campo.",
    cor: "#ea580c",
    crachá: "bg-orange-100 text-orange-800 ring-1 ring-orange-300",
    estadoSugerido: null,
  },
  reuniao: {
    rotulo: "Reunião",
    assunto: "Convocatória para reunião",
    abertura: "Estás convocado para uma reunião de trabalho do projecto.",
    destaque: "Reunião marcada",
    notas: "Chega à hora marcada. Se não puderes comparecer, avisa a equipa com antecedência.",
    cor: "#0284c7",
    crachá: "bg-sky-100 text-sky-800 ring-1 ring-sky-300",
    estadoSugerido: null,
  },
};

/** Locais habituais, por fase, para não se escrever tudo à mão. */
export const LOCAIS_SUGERIDOS = [
  "Sede Principal - Consulvolt",
  "Escritório Regional da Organização",
  "Centro de Formação / Instalações Operacionais",
  "Ponto de encontro no terreno (a equipa confirma previamente)",
  "Videochamada (link enviado por email ou WhatsApp)",
  "Entrevista por telefone",
] as const;

export function faseValida(valor: unknown): valor is Fase {
  return FASES.includes(valor as Fase);
}
