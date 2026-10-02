import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  equipaDe,
  equipaPorExtenso,
  estaNaEquipa,
  responsavelDe,
  validarEquipa,
} from "@/lib/entrevista/equipa";

/* ═══════════════════════════ LER A EQUIPA ══════════════════════════════ */

test("sem migração, o recrutador sozinho é a equipa", () => {
  assert.deepEqual(equipaDe({ recrutador: "joao" }), ["joao"]);
  assert.deepEqual(equipaDe({ recrutador: "joao", recrutadores: null }), ["joao"]);
});

test("com migração, a equipa vem toda e o responsável à cabeça", () => {
  assert.deepEqual(
    equipaDe({ recrutador: "maria", recrutadores: ["joao", "maria", "rosa"] }),
    ["maria", "joao", "rosa"]
  );
});

test("não repete um nome que esteja nas duas colunas", () => {
  assert.deepEqual(equipaDe({ recrutador: "joao", recrutadores: ["joao"] }), ["joao"]);
});

test("ignora vazios, espaços e lixo que venha da base de dados", () => {
  assert.deepEqual(
    equipaDe({ recrutador: "  joao  ", recrutadores: ["", "   ", "maria", null as never, 7 as never] }),
    ["joao", "maria"]
  );
});

test("sem atribuição nenhuma, a equipa é vazia", () => {
  assert.deepEqual(equipaDe(null), []);
  assert.deepEqual(equipaDe(undefined), []);
  assert.deepEqual(equipaDe({}), []);
  assert.deepEqual(equipaDe({ recrutador: null, recrutadores: [] }), []);
});

test("o responsável é sempre o primeiro da equipa", () => {
  assert.equal(responsavelDe({ recrutador: "maria", recrutadores: ["joao", "maria"] }), "maria");
  // Sem responsável gravado, é o primeiro da lista que responde.
  assert.equal(responsavelDe({ recrutador: null, recrutadores: ["joao", "maria"] }), "joao");
  assert.equal(responsavelDe(null), null);
});

/* ═════════════════════════════ O PORTÃO ════════════════════════════════ */

test("qualquer um da equipa entra, e mais ninguém", () => {
  const at = { recrutador: "maria", recrutadores: ["maria", "joao"] };
  assert.equal(estaNaEquipa(at, "maria"), true);
  assert.equal(estaNaEquipa(at, "joao"), true);
  assert.equal(estaNaEquipa(at, "rosa"), false);
});

test("um nome vazio nunca entra, nem numa equipa vazia", () => {
  assert.equal(estaNaEquipa({ recrutador: "joao" }, ""), false);
  assert.equal(estaNaEquipa({ recrutador: "joao" }, "   "), false);
  assert.equal(estaNaEquipa(null, "joao"), false);
});

test("o segundo recrutador entra mesmo não sendo o responsável", () => {
  // É a razão de ser de toda esta mudança.
  assert.equal(estaNaEquipa({ recrutador: "maria", recrutadores: ["maria", "joao"] }, "joao"), true);
  // E, antes dela, não entrava.
  assert.equal(estaNaEquipa({ recrutador: "maria", recrutadores: null }, "joao"), false);
});

/* ═══════════════════════════════ VALIDAR ═══════════════════════════════ */

test("um recrutador chega", () => {
  const r = validarEquipa(["joao"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.equipa, ["joao"]);
});

test("dois e três também", () => {
  assert.equal(validarEquipa(["joao", "maria"]).ok, true);
  assert.equal(validarEquipa(["joao", "maria", "rosa"]).ok, true);
});

test("nenhum não chega, e diz-se porquê", () => {
  const r = validarEquipa([]);
  assert.equal(r.ok, false);
  assert.match(r.erro!, /pelo menos um/i);
});

test("só espaços é o mesmo que nenhum", () => {
  assert.equal(validarEquipa(["  ", ""]).ok, false);
});

test("quatro é demais, e a mensagem diz quantos foram", () => {
  const r = validarEquipa(["a", "b", "c", "d"]);
  assert.equal(r.ok, false);
  assert.match(r.erro!, /máximo 3/i);
  assert.match(r.erro!, /4/);
});

test("repetidos contam uma vez - três nomes iguais são um recrutador", () => {
  const r = validarEquipa(["joao", "joao", "joao"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.equipa, ["joao"]);
});

test("a ordem escolhida é a que fica: o primeiro é o responsável", () => {
  assert.deepEqual(validarEquipa([" maria ", "joao"]).equipa, ["maria", "joao"]);
});

/* ═══════════════════════════════ MOSTRAR ═══════════════════════════════ */

test("por extenso: um nome, ou o primeiro mais a conta dos outros", () => {
  const nomes: Record<string, string> = { joao: "João Manuel", maria: "Maria Sousa", rosa: "Rosa Neto" };
  const por = (u: string) => nomes[u] ?? u;
  assert.equal(equipaPorExtenso([], por), "Por atribuir");
  assert.equal(equipaPorExtenso(["joao"], por), "João Manuel");
  assert.equal(equipaPorExtenso(["joao", "maria"], por), "João Manuel + 1");
  assert.equal(equipaPorExtenso(["joao", "maria", "rosa"], por), "João Manuel + 2");
});
