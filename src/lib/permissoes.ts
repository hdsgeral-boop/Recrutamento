/**
 * ===========================================================================
 * PAPÉIS E PERMISSÕES
 * ---------------------------------------------------------------------------
 * Quatro papéis, uma tabela de capacidades. Nada de verificações espalhadas
 * pelo código com "if (papel === 'admin')": todas as decisões saem daqui, o
 * que torna possível responder à pergunta "quem pode fazer o quê?" lendo um
 * ficheiro só.
 *
 * Regra de ouro: o servidor decide. A interface esconde botões para não
 * enganar ninguém, mas TODA a Server Action volta a confirmar a permissão -
 * esconder um botão não é segurança.
 * ===========================================================================
 */

export const PAPEIS = ["admin", "gestor", "editor", "visualizador"] as const;
export type Papel = (typeof PAPEIS)[number];

export type Capacidade =
  | "ver"                  // abrir o painel, as fichas e o ranking
  | "exportar"             // descarregar o Excel com os dados pessoais
  | "editar_candidatura"   // mudar o estado, escrever observações
  | "analisar"             // correr ou refazer a análise dos documentos
  | "enviar_email"         // qualquer email para candidatos
  | "marcar_evento"        // entrevistas, formações, testes e reuniões
  | "configurar"           // prazo das candidaturas e abertura do formulário
  | "gerir_entrevistas"    // atribuir recrutadores, mudar estados, gerir o roteiro
  | "entrevistar"          // realizar entrevistas (ver a regra do recrutador abaixo)
  | "gerir_utilizadores";  // criar, editar e desactivar contas do painel

interface DefinicaoPapel {
  rotulo: string;
  descricao: string;
  /** Classes do crachá que aparece no cabeçalho. */
  cor: string;
  capacidades: readonly Capacidade[];
}

export const DEFINICOES: Record<Papel, DefinicaoPapel> = {
  admin: {
    rotulo: "Administrador",
    descricao:
      "Faz tudo, incluindo criar e desactivar contas do painel. Só um administrador pode dar acesso a outra pessoa.",
    cor: "bg-consulvolt-vermelho text-white",
    capacidades: [
      "ver",
      "exportar",
      "editar_candidatura",
      "analisar",
      "enviar_email",
      "marcar_evento",
      "configurar",
      "gerir_entrevistas",
      "entrevistar",
      "gerir_utilizadores",
    ],
  },
  gestor: {
    rotulo: "Gestor",
    descricao:
      "Conduz o recrutamento: aprova, marca entrevistas e formações, envia emails, exporta e define o prazo das candidaturas. Não mexe nas contas de acesso.",
    cor: "bg-sky-500 text-white",
    capacidades: [
      "ver",
      "exportar",
      "editar_candidatura",
      "analisar",
      "enviar_email",
      "marcar_evento",
      "configurar",
      "gerir_entrevistas",
      "entrevistar",
    ],
  },
  editor: {
    rotulo: "Editor",
    descricao:
      "Trata das candidaturas: muda estados, escreve observações e manda reanalisar documentos. Não envia emails nem marca nada.",
    cor: "bg-amber-500 text-white",
    capacidades: ["ver", "exportar", "editar_candidatura", "analisar"],
  },
  visualizador: {
    rotulo: "Visualizador",
    descricao:
      "Só consulta. Vê candidaturas, fichas e ranking, e não altera nem envia nada. É o papel certo para quem só precisa de acompanhar.",
    cor: "bg-slate-500 text-white",
    capacidades: ["ver"],
  },
};

/** A pergunta que o resto do sistema faz. */
export function pode(papel: Papel | null | undefined, capacidade: Capacidade): boolean {
  if (!papel) return false;
  return DEFINICOES[papel]?.capacidades.includes(capacidade) ?? false;
}

/** Um papel vindo da base de dados ou do cookie, validado. */
export function papelValido(valor: unknown): Papel {
  return PAPEIS.includes(valor as Papel) ? (valor as Papel) : "visualizador";
}

/** As capacidades por ordem de leitura, com o nome que aparece na matriz. */
export const CAPACIDADES: { chave: Capacidade; rotulo: string; explicacao: string }[] = [
  {
    chave: "ver",
    rotulo: "Ver o painel",
    explicacao: "Abrir a lista de candidaturas, as fichas individuais e o ranking.",
  },
  {
    chave: "exportar",
    rotulo: "Exportar para Excel",
    explicacao: "Descarregar o ficheiro com os dados pessoais de todos os candidatos.",
  },
  {
    chave: "editar_candidatura",
    rotulo: "Editar candidaturas",
    explicacao: "Mudar o estado, escrever observações e repetir o arquivamento no Drive.",
  },
  {
    chave: "analisar",
    rotulo: "Correr análises",
    explicacao: "Mandar ler os documentos outra vez e recalcular a pontuação do ranking.",
  },
  {
    chave: "enviar_email",
    rotulo: "Enviar emails",
    explicacao: "Qualquer mensagem para candidatos: aprovação, lembrete, não selecção.",
  },
  {
    chave: "marcar_evento",
    rotulo: "Marcar fases",
    explicacao: "Entrevistas, formações, testes de fluxo e reuniões, uma a uma ou em massa.",
  },
  {
    chave: "configurar",
    rotulo: "Configurar o recrutamento",
    explicacao:
      "Definir o prazo das candidaturas e abrir ou fechar o formulário público.",
  },
  {
    chave: "gerir_entrevistas",
    rotulo: "Gerir entrevistas",
    explicacao:
      "Atribuir candidatos a recrutadores, mudar o estado de uma entrevista e alterar as perguntas do roteiro.",
  },
  {
    chave: "entrevistar",
    rotulo: "Realizar entrevistas",
    explicacao:
      "Abrir a entrevista de um candidato, marcar as respostas e guardar a avaliação. Quem tem a função de recrutador ganha isto só para os candidatos que lhe foram atribuídos.",
  },
  {
    chave: "gerir_utilizadores",
    rotulo: "Gerir contas",
    explicacao: "Criar contas, mudar papéis, repor palavras-passe e desactivar acessos.",
  },
];

/** O que cada papel vê no menu. */
export const CAPACIDADE_DA_PAGINA: Record<string, Capacidade> = {
  "/admin": "ver",
  "/admin/ranking": "ver",
  "/admin/dashboard": "ver",
  "/admin/comunicacoes": "ver",
  "/admin/definicoes": "configurar",
  "/admin/entrevistas": "entrevistar",
  "/admin/utilizadores": "gerir_utilizadores",
};

/**
 * ===========================================================================
 * A FUNÇÃO DE RECRUTADOR
 * ---------------------------------------------------------------------------
 * Recrutador NÃO é um quinto papel. É uma função que se liga a quem já tem
 * conta, e que se desliga quando a campanha acaba, sem tocar no papel de base.
 *
 * Um editor com a função de recrutador continua a ser editor para tudo o
 * resto: não envia emails, não configura nada. Ganha uma coisa só - entrevistar
 * os candidatos que lhe foram ATRIBUÍDOS, e nenhum outro.
 *
 * Quem tem "entrevistar" pelo papel (administrador e gestor) entrevista
 * qualquer candidato. A diferença está em quem decide o alcance: o papel dá
 * alcance global, a função dá alcance à lista de atribuições.
 * ===========================================================================
 */
export const PAPEIS_ELEGIVEIS_RECRUTADOR: readonly Papel[] = ["admin", "gestor", "editor"];

export function podeSerRecrutador(papel: Papel | null | undefined): boolean {
  return !!papel && PAPEIS_ELEGIVEIS_RECRUTADOR.includes(papel);
}

/**
 * Pode abrir a área de Entrevistas? Pelo papel, ou pela função.
 * A pergunta "pode entrevistar ESTE candidato" é outra, e vive no servidor,
 * em exigirEntrevistaDoCandidato - porque depende da atribuição, que muda.
 */
export function podeEntrarNasEntrevistas(
  papel: Papel | null | undefined,
  eRecrutador: boolean
): boolean {
  return pode(papel, "entrevistar") || (eRecrutador && podeSerRecrutador(papel));
}

