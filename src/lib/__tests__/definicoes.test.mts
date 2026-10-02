import { test } from "node:test";
import assert from "node:assert/strict";

import { aceitaCandidaturas, motivoDoFecho, type Definicoes } from "../definicoes.ts";

/**
 * ===========================================================================
 * O PRAZO DAS CANDIDATURAS
 * ---------------------------------------------------------------------------
 * Esta é a regra que decide se uma pessoa consegue ou não candidatar-se. Um
 * engano aqui não rebenta nada e não aparece no ecrã: simplesmente fecha a
 * porta a quem ainda vinha a tempo, ou deixa entrar candidaturas depois de a
 * equipa já ter fechado a lista. Por isso cada caso tem aqui a data à mão.
 * ===========================================================================
 */

function definicoes(over: Partial<Definicoes> = {}): Definicoes {
  return {
    prazo: "2026-09-12T00:00:00+01:00",
    candidaturasAbertas: true,
    mensagemEncerrado: null,
    actualizadoEm: null,
    actualizadoPor: null,
    ...over,
  };
}

/** Um momento em hora de Angola, escrito como se lê. */
const emAngola = (iso: string) => new Date(`${iso}+01:00`);

test("antes do prazo aceita", () => {
  assert.equal(aceitaCandidaturas(definicoes(), emAngola("2026-09-11T23:59:00")), true);
});

test("no instante do prazo já não aceita", () => {
  assert.equal(aceitaCandidaturas(definicoes(), emAngola("2026-09-12T00:00:00")), false);
});

test("depois do prazo não aceita", () => {
  assert.equal(aceitaCandidaturas(definicoes(), emAngola("2026-09-12T00:00:01")), false);
});

test("os dois dias acrescentados contam mesmo", () => {
  // O prazo era 10 de Setembro. Quem chega a 11 tinha ficado de fora antes
  // desta mudança, e agora entra.
  const meioDiaDoDia11 = emAngola("2026-09-11T12:00:00");
  assert.equal(aceitaCandidaturas(definicoes({ prazo: "2026-09-10T00:00:00+01:00" }), meioDiaDoDia11), false);
  assert.equal(aceitaCandidaturas(definicoes(), meioDiaDoDia11), true);
});

test("o interruptor fecha antes do prazo", () => {
  const cedo = emAngola("2026-09-10T09:00:00");
  assert.equal(aceitaCandidaturas(definicoes({ candidaturasAbertas: false }), cedo), false);
  assert.equal(motivoDoFecho(definicoes({ candidaturasAbertas: false }), cedo), "manual");
});

test("o motivo distingue o prazo do fecho à mão", () => {
  assert.equal(motivoDoFecho(definicoes(), emAngola("2026-09-11T10:00:00")), null);
  assert.equal(motivoDoFecho(definicoes(), emAngola("2026-09-13T10:00:00")), "prazo");
});

test("um prazo ilegível não tranca o formulário", () => {
  // Se a data vier estragada, o mal menor é continuar a aceitar: perder uma
  // candidatura por causa de um campo mal gravado é pior do que receber uma a
  // mais, que a equipa sempre pode recusar à mão.
  assert.equal(aceitaCandidaturas(definicoes({ prazo: "isto-não-é-uma-data" })), true);
});

test("a hora de Angola manda, não a do servidor", () => {
  // A Vercel corre em UTC. Às 23h30 de 11 de Setembro em UTC já são 00h30 do
  // dia 12 em Angola, e o prazo tem de estar fechado.
  const trintaMinutosDepoisEmAngola = new Date("2026-09-11T23:30:00Z");
  assert.equal(aceitaCandidaturas(definicoes(), trintaMinutosDepoisEmAngola), false);
});
