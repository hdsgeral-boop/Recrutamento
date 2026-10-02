import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dataCurta,
  dataHora,
  doInputParaIso,
  fimDoDia,
  inicioDoDia,
  isoParaInput,
  porExtenso,
  porExtensoComDia,
} from "../datas.ts";

// 15 de Setembro de 2026, 09h30 em Luanda = 08:30 UTC.
const NOVE_E_MEIA_EM_LUANDA = "2026-09-15T08:30:00.000Z";

test("mostra a hora de Angola e não a do servidor", () => {
  assert.equal(dataHora(NOVE_E_MEIA_EM_LUANDA), "15/09/2026, 09:30");
  assert.match(porExtenso(NOVE_E_MEIA_EM_LUANDA), /15 de setembro de 2026, às 09h30/i);
  assert.equal(dataCurta(NOVE_E_MEIA_EM_LUANDA), "15/09/2026");
});

test("o dia da semana também sai certo", () => {
  assert.match(porExtensoComDia(NOVE_E_MEIA_EM_LUANDA), /terça-feira/i);
  assert.match(porExtensoComDia(NOVE_E_MEIA_EM_LUANDA), /09h30/);
});

test("uma marcação às 00h30 não salta para o dia anterior", () => {
  // 00h30 de 16 de Setembro em Luanda = 23:30 UTC do dia 15.
  const meiaNoiteEMeia = "2026-09-15T23:30:00.000Z";
  assert.equal(dataHora(meiaNoiteEMeia), "16/09/2026, 00:30");
});

test("o que se escreve no formulário é hora de Angola", () => {
  assert.equal(doInputParaIso("2026-09-15T09:30"), NOVE_E_MEIA_EM_LUANDA);
  assert.equal(doInputParaIso("2026-09-15T09:30:00"), NOVE_E_MEIA_EM_LUANDA);
});

test("input inválido devolve null em vez de uma data absurda", () => {
  for (const mau of ["", "amanhã", "2026-09-15", "15/09/2026 09:30", "2026-13-45T99:99"]) {
    assert.equal(doInputParaIso(mau), null, mau);
  }
});

test("ida e volta entre o input e o ISO não perde a hora", () => {
  for (const valor of ["2026-09-15T09:30", "2026-01-01T00:00", "2026-12-31T23:59"]) {
    assert.equal(isoParaInput(doInputParaIso(valor)!), valor, valor);
  }
});

test("isoParaInput devolve a hora de Luanda, não a UTC", () => {
  assert.equal(isoParaInput(NOVE_E_MEIA_EM_LUANDA), "2026-09-15T09:30");
});

// -------------------------------------------------- INTERVALOS DE DIAS

test("o início e o fim do dia são em hora de Angola", () => {
  // 1 de Setembro em Luanda começa às 23:00 UTC de 31 de Agosto.
  assert.equal(inicioDoDia("2026-09-01"), "2026-08-31T23:00:00.000Z");
  assert.equal(fimDoDia("2026-09-01"), "2026-09-01T22:59:59.999Z");
});

test("o intervalo inclui o último dia inteiro", () => {
  const de = inicioDoDia("2026-09-01")!;
  const ate = fimDoDia("2026-09-10")!;

  // Uma candidatura às 23h de 10 de Setembro em Luanda ainda conta.
  const tarde = new Date("2026-09-10T22:00:00.000Z").toISOString();
  assert.ok(tarde >= de && tarde <= ate, "o dia 10 tem de entrar por inteiro");

  // Uma de 11 de Setembro já não.
  const seguinte = new Date("2026-09-10T23:30:00.000Z").toISOString();
  assert.ok(seguinte > ate, "o dia 11 já está fora");
});

test("datas mal escritas devolvem null", () => {
  for (const mau of ["", "01/09/2026", "2026-9-1", "amanhã", "2026-09-01T10:00"]) {
    assert.equal(inicioDoDia(mau), null, mau);
    assert.equal(fimDoDia(mau), null, mau);
  }
});
