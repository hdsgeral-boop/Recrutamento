import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  interpretarLeitura,
  instrucaoDeLeitura,
  CONFIANCA_MINIMA,
} from "@/lib/entrevista/leitura-ficha";
import type { Pergunta } from "@/lib/entrevista/roteiro";

const ROTEIRO: Pergunta[] = [
  { codigo: "T1", bloco: "tecnica", pergunta: "Uma?", procurar: "", peso: 50 },
  { codigo: "C1", bloco: "comportamental", pergunta: "Duas?", procurar: "", peso: 50 },
];

test("uma leitura limpa vira marcações", () => {
  const r = interpretarLeitura(
    { linhas: [
      { codigo: "T1", marcacao: "bom", confianca: 0.97 },
      { codigo: "C1", marcacao: "mau", confianca: 0.95 },
    ], confianca_global: 0.96 },
    ROTEIRO
  );

  assert.deepEqual(r.respostas, { T1: "bom", C1: "mau" });
  assert.equal(r.vazia, false);
  assert.equal(r.duvidosas.length, 0);
  assert.equal(r.emFalta.length, 0);
});

test("uma marcação pouco confiante NÃO entra no ecrã", () => {
  // Uma bola que o modelo mal viu não pode aparecer já preenchida: quem revê
  // olhava para ela e seguia em frente.
  const r = interpretarLeitura(
    { linhas: [
      { codigo: "T1", marcacao: "bom", confianca: 0.4 },
      { codigo: "C1", marcacao: "bom", confianca: 0.99 },
    ] },
    ROTEIRO
  );

  assert.deepEqual(r.respostas, { C1: "bom" });
  assert.equal(r.duvidosas.length, 1);
  assert.equal(r.duvidosas[0].codigo, "T1");
});

test("a fasquia é 0.85", () => {
  assert.equal(CONFIANCA_MINIMA, 0.85);
  const acima = interpretarLeitura({ linhas: [{ codigo: "T1", marcacao: "bom", confianca: 0.85 }] }, ROTEIRO);
  const abaixo = interpretarLeitura({ linhas: [{ codigo: "T1", marcacao: "bom", confianca: 0.84 }] }, ROTEIRO);
  assert.equal(acima.respostas.T1, "bom");
  assert.equal(abaixo.respostas.T1, undefined);
});

test("códigos que não existem no roteiro são postos de parte, não inventados", () => {
  const r = interpretarLeitura(
    { linhas: [
      { codigo: "T1", marcacao: "bom", confianca: 0.95 },
      { codigo: "ZZ", marcacao: "bom", confianca: 0.99 },
    ] },
    ROTEIRO
  );

  assert.deepEqual(r.desconhecidos, ["ZZ"]);
  assert.deepEqual(Object.keys(r.respostas), ["T1"]);
});

test("perguntas que o modelo não viu ficam listadas como em falta", () => {
  const r = interpretarLeitura({ linhas: [{ codigo: "T1", marcacao: "bom", confianca: 0.95 }] }, ROTEIRO);
  assert.deepEqual(r.emFalta, ["C1"]);
});

test("uma linha em branco é normal, e não é erro", () => {
  const r = interpretarLeitura(
    { linhas: [{ codigo: "T1", marcacao: null, confianca: 0.98 }] },
    ROTEIRO
  );
  assert.equal(r.vazia, false);
  assert.equal(r.respostas.T1, undefined);
  assert.equal(r.duvidosas.length, 0);
});

test("aceita maiúsculas, acentos e percentagens", () => {
  const r = interpretarLeitura(
    { linhas: [
      { codigo: "t1", marcacao: "Razoável", confianca: 95 },
      { codigo: "C1", marcacao: "BOM", confianca: 0.9 },
    ] },
    ROTEIRO
  );
  assert.deepEqual(r.respostas, { T1: "razoavel", C1: "bom" });
});

test("um código repetido fica com a primeira leitura", () => {
  const r = interpretarLeitura(
    { linhas: [
      { codigo: "T1", marcacao: "bom", confianca: 0.95 },
      { codigo: "T1", marcacao: "mau", confianca: 0.99 },
    ] },
    ROTEIRO
  );
  assert.equal(r.respostas.T1, "bom");
  assert.equal(r.linhas.length, 1);
});

test("resposta sem linhas devolve leitura vazia com aviso, e não rebenta", () => {
  for (const cru of [{}, { linhas: [] }, { linhas: "nada" }, { linhas: null }]) {
    const r = interpretarLeitura(cru as never, ROTEIRO);
    assert.equal(r.vazia, true);
    assert.ok(r.aviso);
    assert.deepEqual(r.respostas, {});
  }
});

test("o aviso do modelo chega ao painel", () => {
  const r = interpretarLeitura(
    { linhas: [{ codigo: "T1", marcacao: "bom", confianca: 0.9 }], aviso: "Fotografia tremida." },
    ROTEIRO
  );
  assert.equal(r.aviso, "Fotografia tremida.");
});

test("a confiança global nunca é maior do que a média das linhas", () => {
  // O modelo pode declarar-se muito confiante e ter lido mal linha a linha.
  const r = interpretarLeitura(
    { linhas: [
      { codigo: "T1", marcacao: "bom", confianca: 0.5 },
      { codigo: "C1", marcacao: "bom", confianca: 0.5 },
    ], confianca_global: 0.99 },
    ROTEIRO
  );
  assert.equal(r.confiancaGlobal, 0.5);
});

test("a instrução proíbe o modelo de calcular a nota", () => {
  const t = instrucaoDeLeitura(ROTEIRO);
  assert.match(t, /NUNCA calcules pontuações/);
  assert.match(t, /T1, C1/);
});
