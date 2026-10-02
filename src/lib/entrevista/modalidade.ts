/**
 * ===========================================================================
 * COMO SE FAZ A ENTREVISTA - videochamada ou chamada telefónica
 * ---------------------------------------------------------------------------
 * O candidato escolhe entre duas formas, e as duas têm regras diferentes de
 * propósito:
 *
 *  VIDEOCHAMADA   por Google Meet. O candidato recebe o link por email e
 *                 entra à hora marcada. Se falhar, remarca-se: um link que
 *                 não abriu, uma rede que caiu ou um telemóvel sem dados não
 *                 são culpa de ninguém, e a pessoa não pode ser excluída por
 *                 isso.
 *
 *  CHAMADA        por telefone. A equipa liga até TRÊS vezes. Esgotadas as
 *                 três sem atender, não há remarcação.
 *
 * PORQUE É QUE A REGRA DAS TRÊS TENTATIVAS VIVE AQUI, E NÃO NO ECRÃ
 * Esconder o botão de remarcar não é regra nenhuma: quem souber o endereço
 * chama a acção à mesma. A regra tem de ser uma função que o servidor
 * pergunta antes de escrever, e é o que está aqui. O ecrã limita-se a
 * mostrar o que esta função já decidiu.
 * ===========================================================================
 */

export const MODALIDADES = ["videochamada", "chamada"] as const;
export type Modalidade = (typeof MODALIDADES)[number];

/**
 * O que fica gravado em `candidatos.entrevista_modalidade`.
 *
 * `por_escolher` é o estado em que o candidato fica assim que o email sai: já
 * foi convidado, com as duas opções explicadas, e ainda não respondeu a dizer
 * qual prefere. Não é o mesmo que NULO - nulo é uma marcação anterior a tudo
 * isto, que continua a funcionar como sempre funcionou.
 *
 * A contagem das três chamadas só começa depois de a escolha ser registada:
 * ninguém gasta tentativas enquanto não disse que queria ser chamado.
 */
export const POR_ESCOLHER = "por_escolher" as const;
export type ModalidadeGravada = Modalidade | typeof POR_ESCOLHER;

export function modalidadeGravadaValida(valor: unknown): valor is ModalidadeGravada {
  return valor === POR_ESCOLHER || MODALIDADES.includes(valor as Modalidade);
}

/** Já escolheu, ou ainda estamos à espera da resposta dele? */
export function jaEscolheu(valor: unknown): valor is Modalidade {
  return MODALIDADES.includes(valor as Modalidade);
}

/** Quantas vezes se liga a quem escolheu chamada telefónica. */
export const MAXIMO_TENTATIVAS = 3;

export interface DefinicaoModalidade {
  chave: Modalidade;
  rotulo: string;
  /** Uma linha para o painel. */
  resumo: string;
  /** O que o candidato lê no email. */
  explicacao: string;
  crachá: string;
}

export const DEFINICOES_MODALIDADE: Record<Modalidade, DefinicaoModalidade> = {
  videochamada: {
    chave: "videochamada",
    rotulo: "Videochamada",
    resumo: "Google Meet, com link enviado por email",
    explicacao:
      "Videochamada pelo Google Meet. Recebes o link neste email e entras por ele à hora marcada, do telemóvel ou do computador. Se por alguma razão não conseguires entrar, avisa-nos e remarcamos.",
    crachá: "bg-sky-100 text-sky-800 ring-1 ring-sky-300",
  },
  chamada: {
    chave: "chamada",
    rotulo: "Chamada telefónica",
    resumo: `ligação para o telemóvel, até ${MAXIMO_TENTATIVAS} tentativas`,
    explicacao:
      `Chamada telefónica para o número da tua candidatura. Ligamos até ${MAXIMO_TENTATIVAS} vezes na hora marcada. Se não atenderes nenhuma das ${MAXIMO_TENTATIVAS} chamadas, a entrevista não volta a ser marcada, por isso mantém o telemóvel contigo e ligado.`,
    crachá: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
  },
};

/** Como o estado de espera se apresenta no painel. */
export const DEFINICAO_POR_ESCOLHER = {
  chave: POR_ESCOLHER,
  rotulo: "À espera da escolha",
  resumo: "o email saiu com as duas opções; falta a resposta",
  explicacao:
    "O candidato foi convidado e tem de responder ao email a dizer se prefere videochamada ou chamada telefónica.",
  crachá: "bg-slate-100 text-slate-700 ring-1 ring-slate-300",
} as const;

export function modalidadeValida(valor: unknown): valor is Modalidade {
  return MODALIDADES.includes(valor as Modalidade);
}

/* ══════════════════════════ ESTADO DA CHAMADA ═══════════════════════════ */

export type EstadoChamada = "nao_aplica" | "por_ligar" | "a_tentar" | "esgotado" | "atendeu";

export interface SituacaoChamada {
  estado: EstadoChamada;
  tentativas: number;
  /** Quantas ainda restam. Zero quando se esgotaram. */
  restantes: number;
  /** Uma frase para o painel mostrar. */
  texto: string;
}

export function situacaoDaChamada(
  modalidade: Modalidade | null | undefined,
  tentativas: number,
  atendeu = false
): SituacaoChamada {
  if (modalidade !== "chamada") {
    return { estado: "nao_aplica", tentativas: 0, restantes: 0, texto: "Não é por chamada." };
  }

  const feitas = Number.isFinite(tentativas) && tentativas > 0 ? Math.floor(tentativas) : 0;
  const restantes = Math.max(0, MAXIMO_TENTATIVAS - feitas);

  if (atendeu) {
    return {
      estado: "atendeu",
      tentativas: feitas,
      restantes,
      texto: feitas === 1 ? "Atendeu à primeira." : `Atendeu à ${feitas}.ª tentativa.`,
    };
  }

  if (feitas === 0) {
    return {
      estado: "por_ligar",
      tentativas: 0,
      restantes,
      texto: `Por ligar. ${MAXIMO_TENTATIVAS} tentativas disponíveis.`,
    };
  }

  if (restantes === 0) {
    return {
      estado: "esgotado",
      tentativas: feitas,
      restantes: 0,
      texto: `${MAXIMO_TENTATIVAS} tentativas feitas, sem atender. Não há remarcação.`,
    };
  }

  return {
    estado: "a_tentar",
    tentativas: feitas,
    restantes,
    texto: `${feitas} de ${MAXIMO_TENTATIVAS} tentativas. Faltam ${restantes}.`,
  };
}

/* ═══════════════════════════ PODE REMARCAR? ═════════════════════════════ */

export interface Veredicto {
  ok: boolean;
  erro: string | null;
}

/**
 * A pergunta que o servidor faz antes de deixar remarcar.
 *
 * Só há uma maneira de o "não" acontecer: chamada telefónica com as três
 * tentativas gastas e ninguém do outro lado. Tudo o resto - videochamada,
 * chamada ainda com tentativas, ou sequer sem modalidade escolhida - remarca
 * normalmente. A regra é apertada num sítio só, e de propósito.
 */
export function podeRemarcar(
  modalidade: Modalidade | null | undefined,
  tentativas: number,
  atendeu = false
): Veredicto {
  if (modalidade !== "chamada") return { ok: true, erro: null };
  if (atendeu) return { ok: true, erro: null };

  const s = situacaoDaChamada("chamada", tentativas, false);
  if (s.estado === "esgotado") {
    return {
      ok: false,
      erro: `Foram feitas as ${MAXIMO_TENTATIVAS} tentativas de chamada e o candidato não atendeu. Quem escolhe chamada telefónica não tem remarcação.`,
    };
  }

  return { ok: true, erro: null };
}

/** Pode fazer-se mais uma tentativa de chamada? */
export function podeTentarChamada(
  modalidade: Modalidade | null | undefined,
  tentativas: number,
  atendeu = false
): Veredicto {
  if (modalidade !== "chamada") {
    return { ok: false, erro: "Este candidato não escolheu chamada telefónica." };
  }
  if (atendeu) {
    return { ok: false, erro: "O candidato já atendeu. A entrevista está feita." };
  }
  if (situacaoDaChamada("chamada", tentativas).estado === "esgotado") {
    return { ok: false, erro: `As ${MAXIMO_TENTATIVAS} tentativas já foram feitas.` };
  }
  return { ok: true, erro: null };
}

/* ══════════════════════════ LINK DA VIDEOCHAMADA ════════════════════════ */

/**
 * Aceita um link de videochamada do Google e recusa tudo o resto.
 *
 * Não é preciosismo: um link errado no email de cinquenta pessoas são
 * cinquenta candidatos à porta de uma sala que não existe, e ninguém dá por
 * isso até à hora da entrevista.
 */
export function validarLinkVideochamada(bruto: string): Veredicto {
  const link = bruto.trim();
  if (!link) return { ok: false, erro: "Falta o link da videochamada." };

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { ok: false, erro: "Isso não é um endereço válido. Cola o link completo, começado por https://" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, erro: "O link tem de começar por https://" };
  }

  const anfitrioes = ["meet.google.com", "calendar.app.google", "calendar.google.com"];
  if (!anfitrioes.includes(url.hostname)) {
    return {
      ok: false,
      erro: "O link tem de ser do Google Meet (meet.google.com) ou de marcação do Google Calendar.",
    };
  }

  if (url.hostname === "meet.google.com" && url.pathname.replace(/\//g, "").length < 6) {
    return { ok: false, erro: "Esse link do Meet parece incompleto." };
  }

  return { ok: true, erro: null };
}


/* ═══════════════════════ O QUE ACONTECEU NA CHAMADA ═════════════════════ */

/**
 * Os desfechos possíveis de uma tentativa.
 *
 * Vive aqui, e não ao lado da acção de servidor, por uma razão prática: um
 * ficheiro "use server" só pode exportar funções assíncronas, e isto é uma
 * lista. Vive bem aqui na mesma - é vocabulário do domínio, não mecânica de
 * gravação.
 *
 * «Pediu para ligar depois» conta como tentativa gasta, de propósito: a
 * chamada foi feita e o tempo da equipa foi gasto. O que muda é que se sabe
 * que vale a pena usar a seguinte.
 */
export const RESULTADOS_CHAMADA = [
  { chave: "atendeu", rotulo: "Atendeu", fecha: true },
  { chave: "nao_atendeu", rotulo: "Não atendeu", fecha: false },
  { chave: "desligado", rotulo: "Telemóvel desligado", fecha: false },
  { chave: "numero_errado", rotulo: "Número errado", fecha: false },
  { chave: "pediu_para_ligar_depois", rotulo: "Pediu para ligar depois", fecha: false },
] as const;

export type ResultadoChamada = (typeof RESULTADOS_CHAMADA)[number]["chave"];

export function resultadoValido(valor: unknown): valor is ResultadoChamada {
  return RESULTADOS_CHAMADA.some((r) => r.chave === valor);
}

export function rotuloDoResultado(valor: string): string {
  return RESULTADOS_CHAMADA.find((r) => r.chave === valor)?.rotulo ?? valor;
}

/** Uma tentativa já feita, tal como se lê na ficha. */
export interface LinhaTentativa {
  numero: number;
  quando: string;
  resultado: ResultadoChamada;
  quem: string | null;
  observacoes: string | null;
}
