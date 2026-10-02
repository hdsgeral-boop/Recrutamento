import { extraccaoVazia } from "@/lib/ranking/rubrica-padrao-v1";
import type { Experiencia, Extraccao } from "@/lib/ranking/tipos";

/**
 * ===========================================================================
 * FUSÃO DAS DUAS LEITURAS
 * ---------------------------------------------------------------------------
 * Ficheiro puro, sem rede e sem "server-only", para poder ser testado
 * directamente. É a mesma função que a produção usa - não uma cópia.
 * ===========================================================================
 */

/**
 * Tira o primeiro objecto JSON completo de uma resposta do modelo.
 *
 * Os modelos, mesmo em modo JSON, às vezes acrescentam cercas de markdown,
 * uma frase antes, ou um segundo objecto a seguir ao primeiro. Um JSON.parse
 * do texto todo rebenta em qualquer um desses casos e perde-se a extracção
 * inteira por causa de um carácter a mais.
 *
 * Percorremos as chavetas a contar profundidade, ignorando o que está dentro
 * de cadeias de texto e o que vem escapado, e devolvemos o primeiro objecto
 * que fecha.
 */
export function extrairPrimeiroJson(bruto: string): string | null {
  const texto = bruto
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const inicio = texto.indexOf("{");
  if (inicio === -1) return null;

  let profundidade = 0;
  let dentroDeTexto = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];

    if (escapado) {
      escapado = false;
      continue;
    }

    if (c === "\\") {
      escapado = true;
      continue;
    }

    if (c === '"') {
      dentroDeTexto = !dentroDeTexto;
      continue;
    }

    if (dentroDeTexto) continue;

    if (c === "{") profundidade++;
    else if (c === "}") {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }

  return null;
}

/** Completa o que vier do modelo, para a rubrica nunca apanhar undefined. */
export function sanear(cru: Partial<Extraccao>): Extraccao {
  const completa: Extraccao = { ...extraccaoVazia(), ...cru };
  completa.experiencias = Array.isArray(completa.experiencias) ? completa.experiencias : [];
  completa.documentos_ilegiveis = Array.isArray(completa.documentos_ilegiveis)
    ? completa.documentos_ilegiveis
    : [];
  completa.incoerencias = Array.isArray(completa.incoerencias) ? completa.incoerencias : [];
  completa.escolaridade = { ...extraccaoVazia().escolaridade, ...(completa.escolaridade ?? {}) };
  completa.electricidade = { ...extraccaoVazia().electricidade, ...(completa.electricidade ?? {}) };
  completa.carta_conducao = { ...extraccaoVazia().carta_conducao, ...(completa.carta_conducao ?? {}) };
  completa.informatica = { ...extraccaoVazia().informatica, ...(completa.informatica ?? {}) };
  completa.fotografia = { ...extraccaoVazia().fotografia, ...(completa.fotografia ?? {}) };
  completa.atendimento_publico = {
    ...extraccaoVazia().atendimento_publico,
    ...(completa.atendimento_publico ?? {}),
  };
  completa.residencia_bi = { ...extraccaoVazia().residencia_bi, ...(completa.residencia_bi ?? {}) };
  completa.naturalidade = { ...extraccaoVazia().naturalidade, ...(completa.naturalidade ?? {}) };
  return completa;
}

/** Força do nível eléctrico, para a fusão escolher o mais bem fundamentado. */
const FORCA_ELECTRICA = { nenhum: 0, proximo: 1, generico: 2, bt: 3, mt_bt: 4 } as const;

/**
 * Funde o que o modelo leu com o que a heurística apanhou.
 *
 * Princípio: o modelo lê melhor o contexto, por isso ganha onde encontrou
 * alguma coisa. A heurística é literal, por isso preenche os buracos que ele
 * deixou. Nunca se perde um facto por causa da fusão - só se acrescenta.
 */
export function fundir(heuristica: Extraccao, modelo: Extraccao): Extraccao {
  const experiencias: Experiencia[] = [...modelo.experiencias];
  const tiposDoModelo = new Set(modelo.experiencias.map((x) => x.tipo_campo));

  // Da heurística só entram os tipos de trabalho que o modelo não viu.
  for (const exp of heuristica.experiencias) {
    if (!tiposDoModelo.has(exp.tipo_campo)) experiencias.push(exp);
  }

  const nivelElectrico =
    FORCA_ELECTRICA[modelo.electricidade.nivel] >= FORCA_ELECTRICA[heuristica.electricidade.nivel]
      ? modelo.electricidade
      : heuristica.electricidade;

  return {
    nome_nos_documentos: modelo.nome_nos_documentos ?? heuristica.nome_nos_documentos,
    bi_numero: modelo.bi_numero ?? heuristica.bi_numero,
    residencia_bi: {
      bairro: modelo.residencia_bi.bairro ?? heuristica.residencia_bi.bairro,
      municipio: modelo.residencia_bi.municipio ?? heuristica.residencia_bi.municipio,
      provincia: modelo.residencia_bi.provincia ?? heuristica.residencia_bi.provincia,
    },
    naturalidade: {
      municipio: modelo.naturalidade.municipio ?? heuristica.naturalidade.municipio,
      provincia: modelo.naturalidade.provincia ?? heuristica.naturalidade.provincia,
    },
    escolaridade: {
      concluiu_12a: modelo.escolaridade.concluiu_12a || heuristica.escolaridade.concluiu_12a,
      curso: modelo.escolaridade.curso ?? heuristica.escolaridade.curso,
      media_final: modelo.escolaridade.media_final ?? heuristica.escolaridade.media_final,
      nivel_superior: modelo.escolaridade.nivel_superior ?? heuristica.escolaridade.nivel_superior,
      evidencia: modelo.escolaridade.evidencia ?? heuristica.escolaridade.evidencia,
    },
    electricidade: nivelElectrico,
    experiencias,
    carta_conducao: modelo.carta_conducao.tem
      ? modelo.carta_conducao
      : heuristica.carta_conducao.tem
        ? heuristica.carta_conducao
        : modelo.carta_conducao,
    informatica:
      modelo.informatica.nivel !== "nenhum" ? modelo.informatica : heuristica.informatica,
    fotografia: modelo.fotografia.nivel !== "nenhum" ? modelo.fotografia : heuristica.fotografia,
    atendimento_publico: modelo.atendimento_publico.tem
      ? modelo.atendimento_publico
      : heuristica.atendimento_publico,
    documentos_ilegiveis: Array.from(
      new Set([...modelo.documentos_ilegiveis, ...heuristica.documentos_ilegiveis])
    ),
    incoerencias: Array.from(new Set([...modelo.incoerencias, ...heuristica.incoerencias])),
  };
}
