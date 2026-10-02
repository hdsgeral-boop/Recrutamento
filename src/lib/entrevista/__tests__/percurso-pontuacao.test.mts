import { strict as assert } from "node:assert";
import { test } from "node:test";

import { perguntasDoCandidato, pontuarEntrevista } from "@/lib/entrevista/pontuacao";
import { ROTEIRO, type Pergunta } from "@/lib/entrevista/roteiro";

/**
 * ===========================================================================
 * PONTUAR PELO PERCURSO, E NÃO PELO ROTEIRO TODO
 * ---------------------------------------------------------------------------
 * Ninguém responde às dezasseis perguntas: quem tem experiência responde a
 * doze, quem não tem responde às outras doze. Pôr no denominador as quatro
 * do outro percurso baixava a nota de toda a gente sem razão nenhuma.
 * ===========================================================================
 */

const comuns = ROTEIRO.filter((p) => (p.grupo ?? "ambos") === "ambos");
const comExp = ROTEIRO.filter((p) => p.grupo === "com_experiencia");
const semExp = ROTEIRO.filter((p) => p.grupo === "sem_experiencia");

const todasBom = (ps: Pergunta[]) =>
  Object.fromEntries(ps.map((p) => [p.codigo, "bom"])) as never;

test("o percurso deduz-se das marcações: quem respondeu à E1 é de experiência", () => {
  const respostas = todasBom([...comuns, ...comExp]);
  const escolhidas = perguntasDoCandidato(ROTEIRO, respostas);

  assert.equal(escolhidas.length, comuns.length + comExp.length);
  assert.ok(escolhidas.every((p) => p.grupo !== "sem_experiencia"));
});

test("e quem respondeu à N1 é de quem nunca fez", () => {
  const escolhidas = perguntasDoCandidato(ROTEIRO, todasBom([...comuns, ...semExp]));
  assert.ok(escolhidas.every((p) => p.grupo !== "com_experiencia"));
});

test("tudo Bom no percurso dá 100, e não 75 por causa do outro percurso", () => {
  const respostas = todasBom([...comuns, ...comExp]);
  const doPercurso = perguntasDoCandidato(ROTEIRO, respostas);

  assert.equal(pontuarEntrevista(respostas, doPercurso).nota, 100);
  // Contra o roteiro inteiro a mesma entrevista perfeita dava menos:
  assert.ok(pontuarEntrevista(respostas, ROTEIRO).nota < 100);
});

test("uma entrevista perfeita não fica marcada como incompleta", () => {
  const respostas = todasBom([...comuns, ...semExp]);
  const r = pontuarEntrevista(respostas, perguntasDoCandidato(ROTEIRO, respostas));
  assert.equal(r.incompleta, false);
});

test("só perguntas comuns marcadas: manda o grupo que nos passam", () => {
  const soComuns = todasBom(comuns);
  assert.equal(
    perguntasDoCandidato(ROTEIRO, soComuns, "com_experiencia").length,
    comuns.length + comExp.length
  );
  assert.equal(
    perguntasDoCandidato(ROTEIRO, soComuns, "sem_experiencia").length,
    comuns.length + semExp.length
  );
});

test("sem marcações de percurso e sem grupo, ficam só as comuns", () => {
  assert.equal(perguntasDoCandidato(ROTEIRO, todasBom(comuns)).length, comuns.length);
});

test("as marcações mandam sobre o grupo actual: a entrevista pontua-se como foi feita", () => {
  // Foi entrevistado como quem tem experiência. A classificação dele mudou
  // depois, por causa de um documento novo. A nota não pode mudar por isso.
  const respostas = todasBom([...comuns, ...comExp]);
  const escolhidas = perguntasDoCandidato(ROTEIRO, respostas, "sem_experiencia");

  assert.ok(
    escolhidas.some((p) => p.grupo === "com_experiencia"),
    "tinha de manter as perguntas que lhe foram mesmo feitas"
  );
  assert.equal(pontuarEntrevista(respostas, escolhidas).nota, 100);
});
