import { strict as assert } from "node:assert";
import { test } from "node:test";

import { estadoVisivel, estadosPossiveis, DEFINICOES_ESTADO, ESTADOS } from "@/lib/entrevista/estados";
import { classificarExperiencia } from "@/lib/entrevista/experiencia";

// -------------------------------------------------------------- ESTADOS

test("sem atribuição, o estado é não atribuída", () => {
  assert.equal(estadoVisivel({ gravado: null, temData: false, temAvaliacao: false }), "nao_atribuida");
  // Mesmo com data marcada pela agenda: ter data não é ter responsável.
  assert.equal(estadoVisivel({ gravado: null, temData: true, temAvaliacao: false }), "nao_atribuida");
});

test("atribuída sem data, e agendada com data", () => {
  assert.equal(estadoVisivel({ gravado: "atribuida", temData: false, temAvaliacao: false }), "atribuida");
  assert.equal(estadoVisivel({ gravado: "atribuida", temData: true, temAvaliacao: false }), "agendada");
});

test("uma avaliação guardada manda em tudo o resto", () => {
  // O facto consumado é mais forte do que qualquer coluna. Se alguém marcou
  // "faltou" e a avaliação existe, é porque a entrevista aconteceu.
  assert.equal(estadoVisivel({ gravado: "atribuida", temData: true, temAvaliacao: true }), "concluida");
  assert.equal(estadoVisivel({ gravado: "ausente", temData: true, temAvaliacao: true }), "concluida");
  assert.equal(estadoVisivel({ gravado: "cancelada", temData: false, temAvaliacao: true }), "concluida");
});

test("os estados marcados à mão vencem a dedução pela data", () => {
  for (const e of ["cancelada", "ausente", "nao_realizada", "em_entrevista", "reagendada"] as const) {
    assert.equal(estadoVisivel({ gravado: e, temData: true, temAvaliacao: false }), e);
  }
});

test("não se pode marcar concluída à mão", () => {
  // Concluída significa "há avaliação guardada". Deixá-la num menu criava um
  // estado que não corresponde a nada.
  assert.equal(estadosPossiveis("atribuida").includes("concluida" as never), false);
});

test("sem atribuição não há estados para escolher", () => {
  assert.deepEqual(estadosPossiveis("nao_atribuida"), []);
});

test("todos os estados têm definição", () => {
  for (const e of ESTADOS) {
    assert.ok(DEFINICOES_ESTADO[e], `falta a definição de ${e}`);
    assert.ok(DEFINICOES_ESTADO[e].rotulo.length > 0);
  }
});

// --------------------------------------------------------- EXPERIÊNCIA

test("a correcção à mão manda em tudo", () => {
  const r = classificarExperiencia({
    manual: "sem_experiencia",
    criterio: { pontos: 24, maximo: 24 },
    declarou: true,
  });
  assert.equal(r.grupo, "sem_experiencia");
  assert.equal(r.origem, "manual");
});

test("a rubrica decide acima de um terço do critério", () => {
  assert.equal(classificarExperiencia({ criterio: { pontos: 8, maximo: 24 } }).grupo, "com_experiencia");
  assert.equal(classificarExperiencia({ criterio: { pontos: 7, maximo: 24 } }).grupo, "sem_experiencia");
  assert.equal(classificarExperiencia({ criterio: { pontos: 24, maximo: 24 } }).origem, "rubrica");
});

test("a rubrica vence o formulário, porque leu os documentos", () => {
  const r = classificarExperiencia({ criterio: { pontos: 0, maximo: 24 }, declarou: true });
  assert.equal(r.grupo, "sem_experiencia");
  assert.equal(r.origem, "rubrica");
});

test("sem análise, vale o que o candidato declarou", () => {
  assert.equal(classificarExperiencia({ declarou: true }).grupo, "com_experiencia");
  assert.equal(classificarExperiencia({ declarou: false }).grupo, "sem_experiencia");
  assert.equal(classificarExperiencia({ declarou: false }).origem, "formulario");
});

test("sem nada, fica indeterminado em vez de adivinhar", () => {
  const r = classificarExperiencia({});
  assert.equal(r.grupo, "indeterminado");
  assert.equal(r.origem, "nenhuma");
});

test("um critério com máximo zero não rebenta nem divide por zero", () => {
  const r = classificarExperiencia({ criterio: { pontos: 0, maximo: 0 }, declarou: true });
  assert.equal(r.grupo, "com_experiencia");
  assert.equal(r.origem, "formulario");
});
