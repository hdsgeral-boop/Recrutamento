/**
 * ===========================================================================
 * ROTEIRO DA ENTREVISTA - versão ugp-e1
 * ---------------------------------------------------------------------------
 * Dez perguntas, pesos que somam 100, três respostas possíveis em cada uma.
 *
 * PORQUE É QUE AS PERGUNTAS SÃO ESTAS
 * A rubrica ugp-v1 já pontua o que os documentos provam: onde a pessoa mora,
 * que experiência declarou, que formação tem. A entrevista não repete isso.
 * Serve para ver o que um CV nunca mostra: o que a pessoa faz quando a porta
 * não abre, quando o contador está trancado, quando o morador desconfia.
 *
 * O piloto mediu 14.541 portas para 8.399 inquéritos, com 74,7% dos
 * insucessos em casa fechada ou recusa. É por isso que as perguntas de
 * situação - a 3, a 7 e a 9 - pesam tanto como as de experiência.
 *
 * VERSÃO
 * O roteiro é versionado como a rubrica. Uma entrevista guardada fica ligada
 * à versão com que foi feita, para uma mudança futura nas perguntas não
 * reescrever a avaliação de quem já foi entrevistado. Se mudares perguntas ou
 * pesos, sobe a versão em vez de editar em cima.
 * ===========================================================================
 */

import { GRUPOS_PERGUNTA, type GrupoPergunta } from "@/lib/entrevista/experiencia";


/** As três marcações possíveis, e quanto vale cada uma do peso da pergunta. */
export const ESCALA = {
  bom: { rotulo: "Bom", fraccao: 1, cor: "bg-emerald-500", crachá: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" },
  razoavel: { rotulo: "Razoável", fraccao: 0.5, cor: "bg-amber-500", crachá: "bg-amber-100 text-amber-800 ring-1 ring-amber-300" },
  mau: { rotulo: "Mau", fraccao: 0, cor: "bg-rose-500", crachá: "bg-rose-100 text-rose-800 ring-1 ring-rose-300" },
} as const;

export type Marcacao = keyof typeof ESCALA;
export const MARCACOES = Object.keys(ESCALA) as Marcacao[];

export type Bloco = "tecnica" | "comportamental";

export interface Pergunta {
  /** Código curto e estável. Entra na ficha impressa e na leitura óptica. */
  codigo: string;
  bloco: Bloco;
  pergunta: string;
  /** O que o entrevistador deve procurar na resposta. Não vai no email. */
  procurar: string;
  peso: number;
  /**
   * A quem esta pergunta se faz: a todos, só a quem já fez trabalho de
   * cadastro, ou só a quem nunca fez.
   *
   * OPCIONAL de propósito. As perguntas gravadas antes desta mudança não têm
   * o campo, e leem-se como "ambos" - que é exactamente o que sempre foram.
   * Assim nenhuma versão antiga do roteiro precisa de ser reescrita.
   */
  grupo?: GrupoPergunta;
}

/**
 * ===========================================================================
 * ROTEIRO bengo-e1
 * ---------------------------------------------------------------------------
 * O Projecto Bengo é cadastro de rede ELÉCTRICA: postos de transformação,
 * apoios, contadores de energia, Média e Baixa Tensão. As perguntas são as
 * mesmas na forma do que se usa no projecto UGP - que é cadastro de água -
 * mas o conteúdo é deste trabalho, e há uma que não existe lá: segurança
 * junto de equipamento em tensão. Num cadastro de água uma má decisão
 * estraga um registo; aqui pode matar alguém.
 *
 * TRÊS CONJUNTOS
 *   Oito comuns, 76 pontos, feitas a toda a gente.
 *   Duas para quem já fez trabalho de cadastro, 24 pontos.
 *   Duas para quem nunca fez, 24 pontos.
 *
 * Cada percurso soma 100. É isso que faz a nota de um comparar-se com a do
 * outro.
 * ===========================================================================
 */

export const VERSAO_ROTEIRO = "padrao-e1" as const;

const ROTEIRO_BASE: Pergunta[] = [
  // ------------------------------------------------------- COMUNS (76)
  {
    codigo: "T2",
    bloco: "tecnica",
    grupo: "ambos",
    pergunta:
      "Como utilizarias um tablet ou telemóvel de trabalho para recolha de dados, posicionamento e registo fotográfico?",
    procurar:
      "À vontade com ferramentas móveis e percepção de que os dados têm de ser registados com precisão no momento da acção.",
    peso: 10,
  },
  {
    codigo: "T3",
    bloco: "tecnica",
    grupo: "ambos",
    pergunta:
      "Chegas a um local de trabalho ou cliente onde a porta está fechada ou o responsável não está disponível. O que fazes a seguir?",
    procurar:
      "Boa resposta: regista a tentativa, contacta a coordenação ou responsável, agenda retorno. Má resposta: inventa os dados ou omite a ocorrência.",
    peso: 10,
  },
  {
    codigo: "T4",
    bloco: "tecnica",
    grupo: "ambos",
    pergunta:
      "Que tipo de evidências ou registos recolhes no desempenho das tuas tarefas para permitir validação posterior?",
    procurar:
      "Identificação clara, enquadramento para confirmação do estado e rigor que permita conferência sem necessidade de regresso ao local.",
    peso: 7,
  },
  {
    codigo: "T5",
    bloco: "tecnica",
    grupo: "ambos",
    pergunta:
      "Durante o desempenho das tuas tarefas, identificas uma situação com risco para a segurança da equipa ou de terceiros. Qual é a tua actuação imediata?",
    procurar:
      "Afastar-se do perigo, sinalizar para evitar acidentes e comunicar imediatamente à chefia/equipa de segurança.",
    peso: 10,
  },
  {
    codigo: "T6",
    bloco: "tecnica",
    grupo: "ambos",
    pergunta:
      "Como te orientas e organizas as tuas tarefas numa localidade ou área de intervenção que não conheces previamente?",
    procurar:
      "Pontos de referência, ferramentas de mapa/GPS e planeamento prévio do percurso e actividades.",
    peso: 7,
  },
  {
    codigo: "C1",
    bloco: "comportamental",
    grupo: "ambos",
    pergunta:
      "Numa situação em que um cliente ou cidadão se mostra desconfiado ou resistente à tua presença de serviço, como conduzes a conversa?",
    procurar:
      "Calma, identificação profissional, explicar claramente o objectivo do serviço e evitar confrontações.",
    peso: 12,
  },
  {
    codigo: "C3",
    bloco: "comportamental",
    grupo: "ambos",
    pergunta:
      "No fim do dia faltam-te os dados de cinco tarefas que não conseguiste concluir. O que registas no relatório?",
    procurar:
      "Registar estritamente a realidade: indicar as tarefas não concluídas e o motivo. Nunca simular conclusão.",
    peso: 10,
  },
  {
    codigo: "C4",
    bloco: "comportamental",
    grupo: "ambos",
    pergunta:
      "O trabalho começa às 7h30 no ponto de encontro da empresa. Como te organizas, e o que fazes se um dia te atrasares?",
    procurar:
      "Pontualidade planeada com margem e comunicação atempada em caso de imprevisto.",
    peso: 10,
  },

  // --------------------------------------------- SÓ PARA QUEM JÁ FEZ (24)
  {
    codigo: "E1",
    bloco: "tecnica",
    grupo: "com_experiencia",
    pergunta:
      "Conta-me um dia típico do teu trabalho anterior: que metas tinhas, que rotina seguias e como gerias imprevistos.",
    procurar:
      "Metas concretas, organização de método e experiência autêntica na função.",
    peso: 14,
  },
  {
    codigo: "E2",
    bloco: "tecnica",
    grupo: "com_experiencia",
    pergunta:
      "Qual foi o maior desafio ou erro que vivenciaste nesse trabalho, e como é que foi solucionado?",
    procurar:
      "Capacidade de reconhecer dificuldades com honestidade e focar na solução e melhoria contínua.",
    peso: 10,
  },

  // ------------------------------------------- SÓ PARA QUEM NUNCA FEZ (24)
  {
    codigo: "N1",
    bloco: "comportamental",
    grupo: "sem_experiencia",
    pergunta:
      "Conta-me um trabalho ou actividade em que tivesses de seguir um procedimento rigoroso, todos os dias.",
    procurar:
      "Atenção ao detalhe, compromisso com normas e disciplina operacional.",
    peso: 14,
  },
  {
    codigo: "N2",
    bloco: "comportamental",
    grupo: "sem_experiencia",
    pergunta:
      "Conta-me uma situação em que tiveste de executar actividades exigentes ou sob pressão. Como geriste o esforço?",
    procurar:
      "Resiliência, capacidade física e mental de entrega e atitude positiva perante desafios.",
    peso: 10,
  },
];

/** O roteiro em vigor no código. */
export const ROTEIRO: Pergunta[] = ROTEIRO_BASE;

export const SEMENTES: Record<string, Pergunta[]> = {
  [VERSAO_ROTEIRO]: ROTEIRO_BASE,
  "bengo-e1": ROTEIRO_BASE,
};

/** A soma dos pesos. É 100 por construção, e há um teste que o garante. */
export const TOTAL_ROTEIRO = ROTEIRO.reduce((s, p) => s + p.peso, 0);

/**
 * O roteiro do código é a SEMENTE: é o que vale enquanto ninguém tiver
 * gravado nada no painel, e é o que fica quando a migração ainda não correu.
 * A partir do momento em que a equipa grava, manda a versão da base de dados.
 */
export const ROTEIRO_SEMENTE = ROTEIRO;

export const PESO_TOTAL_EXIGIDO = 100;

/**
 * Valida um roteiro vindo do painel ou da base de dados.
 *
 * Devolve a lista de problemas; vazia quer dizer que está bom. É a mesma
 * função no browser e no servidor, de propósito: o aviso que aparece a quem
 * escreve tem de ser exactamente a regra que trava a gravação, senão a
 * pessoa corrige o que o ecrã diz e a gravação rejeita à mesma.
 */
export function validarRoteiro(perguntas: Pergunta[]): string[] {
  const erros: string[] = [];

  if (perguntas.length === 0) {
    erros.push("O roteiro tem de ter pelo menos uma pergunta.");
    return erros;
  }

  const codigos = new Set<string>();
  for (const p of perguntas) {
    const codigo = p.codigo?.trim();

    if (!codigo) erros.push("Há uma pergunta sem código.");
    else if (!/^[A-Z][A-Z0-9]{0,4}$/.test(codigo)) {
      erros.push(`O código "${codigo}" não serve. Usa letras e números, até 5 caracteres, tipo T1 ou C3.`);
    } else if (codigos.has(codigo)) {
      erros.push(`O código ${codigo} aparece duas vezes. Cada pergunta tem de ter o seu.`);
    } else {
      codigos.add(codigo);
    }

    if (!p.pergunta?.trim()) erros.push(`A pergunta ${codigo || "sem código"} está sem texto.`);
    if (!Number.isFinite(p.peso) || p.peso <= 0) {
      erros.push(`O peso de ${codigo || "uma pergunta"} tem de ser maior do que zero.`);
    }
    if (p.bloco !== "tecnica" && p.bloco !== "comportamental") {
      erros.push(`A pergunta ${codigo || "sem código"} não tem bloco válido.`);
    }
    if (p.grupo !== undefined && !GRUPOS_PERGUNTA.includes(p.grupo)) {
      erros.push(`A pergunta ${codigo || "sem código"} tem um grupo desconhecido.`);
    }
  }

  // A soma verifica-se POR PERCURSO, e não sobre a lista toda.
  //
  // Com perguntas separadas por experiência, ninguém responde a todas: quem
  // tem experiência responde às comuns mais as do seu grupo, e quem não tem
  // responde às comuns mais as do outro. Somar a lista inteira dava sempre
  // mais de 100 e nunca deixaria gravar. O que tem de dar 100 é cada um dos
  // dois percursos - é isso que torna as duas notas comparáveis.
  for (const grupo of ["com_experiencia", "sem_experiencia"] as const) {
    const doPercurso = perguntas.filter((p) => (p.grupo ?? "ambos") === "ambos" || p.grupo === grupo);
    const soma = Math.round(doPercurso.reduce((s, p) => s + (Number(p.peso) || 0), 0) * 100) / 100;

    if (soma !== PESO_TOTAL_EXIGIDO) {
      const nome = grupo === "com_experiencia" ? "com experiência" : "sem experiência";
      erros.push(
        `O percurso de quem é ${nome} soma ${soma} pontos. Tem de somar exactamente ${PESO_TOTAL_EXIGIDO}, ` +
          "senão as duas notas deixam de ser comparáveis."
      );
    }
  }

  return erros;
}

/**
 * Limpa um roteiro vindo do painel: espaços a mais, códigos em minúsculas,
 * pesos que chegaram como texto.
 *
 * ESTA FUNÇÃO EXISTE PARA NÃO SE PERDER NENHUM CAMPO PELO CAMINHO.
 * Antes, o servidor reconstruía cada pergunta campo a campo, à mão, e o
 * `grupo` ficava de fora. O efeito era mau de uma maneira difícil de
 * adivinhar: o ecrã mostrava os dois percursos a 100/100, e a gravação
 * recusava a dizer que somavam 120 - porque, sem grupo, as dezasseis
 * perguntas passavam todas a contar para os dois lados. Quem estava a
 * escrever não tinha como perceber o que fazer a seguir.
 *
 * Por isso parte-se do objecto inteiro (`...p`) e só se toca no que precisa
 * mesmo de ser tocado. Um campo novo na pergunta passa a sobreviver aqui sem
 * ninguém se lembrar de o acrescentar.
 */
export function normalizarRoteiro(perguntas: Pergunta[]): Pergunta[] {
  return perguntas.map((p) => {
    const limpa: Pergunta = {
      ...p,
      codigo: String(p.codigo ?? "").trim().toUpperCase(),
      bloco: p.bloco,
      pergunta: String(p.pergunta ?? "").trim(),
      procurar: String(p.procurar ?? "").trim(),
      peso: Number(p.peso),
    };

    // "ambos" é o valor de omissão: gravá-lo seria gravar ruído, e as
    // versões antigas - que nunca tiveram o campo - deixariam de ser iguais
    // a si próprias na comparação do "não mudou nada".
    if (limpa.grupo === undefined || limpa.grupo === "ambos") delete limpa.grupo;

    return limpa;
  });
}

/**
 * A versão seguinte de uma versão. "ugp-e1" -> "ugp-e2".
 * Se o formato não for o esperado, cola um sufixo em vez de rebentar: uma
 * versão com nome estranho é melhor do que uma gravação perdida.
 */
export function versaoSeguinte(actual: string): string {
  const m = /^(.*?)(\d+)$/.exec(actual.trim());
  if (!m) return `${actual.trim() || "roteiro"}-2`;
  return `${m[1]}${Number(m[2]) + 1}`;
}

export const PERGUNTAS_POR_BLOCO: Record<Bloco, Pergunta[]> = {
  tecnica: ROTEIRO.filter((p) => p.bloco === "tecnica"),
  comportamental: ROTEIRO.filter((p) => p.bloco === "comportamental"),
};

export const NOME_BLOCO: Record<Bloco, string> = {
  tecnica: "Perguntas técnicas",
  comportamental: "Perguntas comportamentais",
};

/** Encontra uma pergunta pelo código, para a leitura da ficha em papel. */
export function perguntaPorCodigo(codigo: string): Pergunta | undefined {
  return ROTEIRO.find((p) => p.codigo === codigo.trim().toUpperCase());
}
