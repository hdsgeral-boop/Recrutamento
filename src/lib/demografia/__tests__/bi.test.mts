import { strict as assert } from "node:assert";
import { test } from "node:test";

import { escalaoEtario, idadeEm, lerBi, lerNascimento, lerSexo } from "@/lib/demografia/bi";

const HOJE = new Date("2026-09-22T12:00:00Z");

/** Um BI angolano tal como o OCR do Drive o costuma devolver. */
const BI_TIPICO = `
REPUBLICA DE ANGOLA
BILHETE DE IDENTIDADE
Nome: JOAO MANUEL DA SILVA
Filiacao: Manuel da Silva e Maria Joao
Naturalidade: LUANDA
Data de Nascimento: 12/03/1990
Sexo: M
Altura: 1,75
N. 003456789LA042
Emitido em: 04/07/2021
Valido ate: 04/07/2031
`;

/* ═════════════════════════════════ SEXO ═════════════════════════════════ */

test("lê o sexo quando está ao pé da etiqueta", () => {
  assert.equal(lerSexo(BI_TIPICO), "M");
  assert.equal(lerSexo("SEXO: F"), "F");
  assert.equal(lerSexo("Sexo Feminino"), "F");
  assert.equal(lerSexo("sexo masculino"), "M");
});

test("aguenta o OCR a trocar letras na etiqueta", () => {
  assert.equal(lerSexo("Sex0: M"), "M");
  assert.equal(lerSexo("seko f"), "F");
});

test("NÃO adivinha o sexo a partir de um M ou F solto no documento", () => {
  assert.equal(lerSexo("Morada: Rua F, Casa M, Luanda"), null);
  assert.equal(lerSexo("N. 003456789LA042"), null);
  assert.equal(lerSexo("Nome: MARIA FERNANDA"), null);
});

test("sem nada escrito devolve vazio, não um palpite", () => {
  assert.equal(lerSexo(""), null);
  assert.equal(lerSexo("documento ilegivel"), null);
});

/* ═════════════════════════ DATA DE NASCIMENTO ═══════════════════════════ */

test("lê a data de nascimento ancorada na etiqueta", () => {
  assert.equal(lerNascimento(BI_TIPICO, HOJE), "1990-03-12");
});

test("NUNCA apanha a data de emissão nem a de validade", () => {
  const n = lerNascimento(BI_TIPICO, HOJE);
  assert.notEqual(n, "2021-07-04");
  assert.notEqual(n, "2031-07-04");
});

test("uma data sem etiqueta nenhuma é ignorada", () => {
  assert.equal(lerNascimento("Emitido em: 04/07/2021\nValido ate: 04/07/2031", HOJE), null);
});

test("aceita as várias formas de escrever a etiqueta e o separador", () => {
  assert.equal(lerNascimento("Nascido a 05-11-1988", HOJE), "1988-11-05");
  assert.equal(lerNascimento("DATA DE NASC. 30.01.1975", HOJE), "1975-01-30");
  assert.equal(lerNascimento("Data do nascimento 7/9/2001", HOJE), "2001-09-07");
});

test("lê o mês por extenso, com e sem acento", () => {
  assert.equal(lerNascimento("Data de Nascimento: 12 de Março de 1990", HOJE), "1990-03-12");
  assert.equal(lerNascimento("Nascido em 3 de agosto de 1995", HOJE), "1995-08-03");
});

test("um ano de dois dígitos num BI é do século passado", () => {
  assert.equal(lerNascimento("Data de Nascimento: 12/03/90", HOJE), "1990-03-12");
});

test("recusa datas impossíveis em vez de as arranjar", () => {
  assert.equal(lerNascimento("Data de Nascimento: 31/02/1990", HOJE), null);
  assert.equal(lerNascimento("Data de Nascimento: 45/13/1990", HOJE), null);
});

test("recusa idades que só podem ser erro de leitura", () => {
  // O OCR leu 2021 (emissão) como se fosse o nascimento: daria 5 anos.
  assert.equal(lerNascimento("Data de Nascimento: 04/07/2021", HOJE), null);
  // 1900 daria 126 anos.
  assert.equal(lerNascimento("Data de Nascimento: 01/01/1900", HOJE), null);
});

/* ═══════════════════════════════ IDADE ══════════════════════════════════ */

test("a idade conta anos completos e respeita o aniversário por fazer", () => {
  assert.equal(idadeEm("1990-03-12", HOJE), 36);
  assert.equal(idadeEm("1990-12-31", HOJE), 35);
  assert.equal(idadeEm("1990-09-22", HOJE), 36);
  assert.equal(idadeEm("1990-09-23", HOJE), 35);
});

test("sem data não há idade nenhuma", () => {
  assert.equal(idadeEm(null, HOJE), null);
  assert.equal(idadeEm("não é uma data", HOJE), null);
});

test("os escalões cobrem tudo, incluindo quem não indicou", () => {
  assert.equal(escalaoEtario(null), "Não indicado");
  assert.equal(escalaoEtario(16), "Menor de 18");
  assert.equal(escalaoEtario(18), "18-24");
  assert.equal(escalaoEtario(24), "18-24");
  assert.equal(escalaoEtario(25), "25-34");
  assert.equal(escalaoEtario(44), "35-44");
  assert.equal(escalaoEtario(70), "55+");
});

/* ═══════════════════════════ LEITURA COMPLETA ═══════════════════════════ */

test("a leitura completa devolve os dois factos e nenhuma nota", () => {
  const r = lerBi(BI_TIPICO, HOJE);
  assert.equal(r.sexo, "M");
  assert.equal(r.nascimento, "1990-03-12");
  assert.equal(r.notas.length, 0);
});

test("quando só encontra um dos dois, diz qual é que falta", () => {
  const r = lerBi("BILHETE DE IDENTIDADE\nNome: ANA\nSexo: F\nN. 001LA042\nEmitido em 2020", HOJE);
  assert.equal(r.sexo, "F");
  assert.equal(r.nascimento, null);
  assert.equal(r.notas.length, 1);
  assert.match(r.notas[0], /data de nascimento/i);
});

test("um BI ilegível não devolve factos inventados", () => {
  const r = lerBi("....", HOJE);
  assert.equal(r.sexo, null);
  assert.equal(r.nascimento, null);
  assert.ok(r.notas.length > 0);
});
