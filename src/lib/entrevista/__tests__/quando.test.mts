import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  dataFutura,
  estaAtrasada,
  hojeEmAngola,
  minimoParaInput,
  mesmaHoraNoutroDia,
  proximoDiaUtil,
  somarDias,
  FOLGA_MINUTOS,
} from "@/lib/entrevista/quando";

/** 22 de Setembro de 2026, 10:00 em Angola. */
const AGORA = new Date("2026-09-22T10:00:00+01:00").getTime();
const M = 60_000;

test("uma data no futuro passa", () => {
  assert.equal(dataFutura("2026-09-23T09:00:00+01:00", AGORA).ok, true);
});

test("uma data no passado é recusada, e o erro diz porquê", () => {
  const r = dataFutura("2026-09-21T09:00:00+01:00", AGORA);
  assert.equal(r.ok, false);
  assert.match(r.erro!, /já passou/);
});

test("há folga para quem marca para daqui a nada", () => {
  // Marcar para as 10:00 às 10:00:30 não pode dar erro por trinta segundos.
  assert.equal(dataFutura(new Date(AGORA - 30_000).toISOString(), AGORA).ok, true);
  assert.equal(dataFutura(new Date(AGORA - (FOLGA_MINUTOS + 1) * M).toISOString(), AGORA).ok, false);
});

test("sem data, ou com data ilegível, recusa em vez de rebentar", () => {
  assert.equal(dataFutura(null, AGORA).ok, false);
  assert.equal(dataFutura("", AGORA).ok, false);
  assert.equal(dataFutura("não é uma data", AGORA).ok, false);
  assert.match(dataFutura("não é uma data", AGORA).erro!, /não são válidas/);
});

test("estaAtrasada é o contrário, sem folga", () => {
  assert.equal(estaAtrasada("2026-09-21T09:00:00+01:00", AGORA), true);
  assert.equal(estaAtrasada("2026-09-23T09:00:00+01:00", AGORA), false);
  // Sem data não é atraso: é uma entrevista por marcar.
  assert.equal(estaAtrasada(null, AGORA), false);
  assert.equal(estaAtrasada("lixo", AGORA), false);
});

// ------------------------------------------------------------------ FUSO

test("o dia de hoje é o de Angola, não o do servidor", () => {
  // 23:30 em UTC já é dia seguinte em Angola (UTC+1).
  const meiaNoiteMenosMeia = new Date("2026-09-22T23:30:00Z").getTime();
  assert.equal(hojeEmAngola(meiaNoiteMenosMeia), "2026-09-23");
});

test("o mínimo do campo vem em hora de Angola e no formato do browser", () => {
  assert.equal(minimoParaInput(AGORA), "2026-09-22T10:00");
  assert.match(minimoParaInput(AGORA), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

// -------------------------------------------------- EMPURRAR MANTENDO A HORA

test("empurrar mantém a hora que já tinha", () => {
  const novo = mesmaHoraNoutroDia("2026-09-21T08:30:00+01:00", "2026-09-28");
  assert.equal(novo, new Date("2026-09-28T08:30:00+01:00").toISOString());
});

test("empurrar preserva a hora mesmo com a original guardada em UTC", () => {
  // 07:30Z é 08:30 em Angola: o que tem de sobreviver é a hora local.
  const novo = mesmaHoraNoutroDia("2026-09-21T07:30:00Z", "2026-09-28");
  const hora = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Luanda",
  }).format(new Date(novo!));
  assert.equal(hora, "08:30");
});

test("empurrar com lixo devolve null em vez de uma data errada", () => {
  assert.equal(mesmaHoraNoutroDia("lixo", "2026-09-28"), null);
  assert.equal(mesmaHoraNoutroDia("2026-09-21T08:30:00+01:00", "28/09/2026"), null);
});

// ------------------------------------------------------------- DIAS ÚTEIS

test("somar dias atravessa o fim do mês", () => {
  assert.equal(somarDias("2026-09-29", 3), "2026-10-02");
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
});

test("o próximo dia útil salta o fim-de-semana", () => {
  // 26 de Setembro de 2026 é sábado.
  assert.equal(proximoDiaUtil("2026-09-26"), "2026-09-28");
  assert.equal(proximoDiaUtil("2026-09-27"), "2026-09-28");
  // Um dia útil devolve-se a si próprio.
  assert.equal(proximoDiaUtil("2026-09-28"), "2026-09-28");
});
