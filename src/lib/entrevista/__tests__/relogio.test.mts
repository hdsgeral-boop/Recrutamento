import { strict as assert } from "node:assert";
import { test } from "node:test";

import { estadoDoRelogio, formatar, SEGUNDOS_DE_AVISO } from "@/lib/entrevista/relogio";

const INICIO = "2026-09-22T08:30:00+01:00";
const T = (minutos: number) => new Date(INICIO).getTime() + minutos * 60_000;

test("sem duração, o relógio está parado", () => {
  assert.equal(estadoDoRelogio(INICIO, null).inactivo, true);
  assert.equal(estadoDoRelogio(INICIO, 0).inactivo, true);
  assert.equal(estadoDoRelogio(INICIO, null).texto, "--:--");
});

test("sem início, o relógio está parado", () => {
  // A entrevista ainda não começou: não há de onde contar.
  assert.equal(estadoDoRelogio(null, 30).inactivo, true);
});

test("uma data ilegível não rebenta o relógio", () => {
  assert.equal(estadoDoRelogio("isto não é uma data", 30).inactivo, true);
});

test("no instante em que começa, falta o tempo todo", () => {
  const r = estadoDoRelogio(INICIO, 30, T(0));
  assert.equal(r.segundos, 1800);
  assert.equal(r.texto, "30:00");
  assert.equal(r.fraccao, 0);
  assert.equal(r.fase, "a-correr");
});

test("a meio, falta metade", () => {
  const r = estadoDoRelogio(INICIO, 30, T(15));
  assert.equal(r.texto, "15:00");
  assert.equal(r.fraccao, 0.5);
  assert.equal(r.fase, "a-correr");
});

test("avisa quando faltam cinco minutos, e não antes", () => {
  assert.equal(estadoDoRelogio(INICIO, 30, T(25)).fase, "a-acabar");
  assert.equal(estadoDoRelogio(INICIO, 30, T(24.9)).fase, "a-correr");
  assert.equal(SEGUNDOS_DE_AVISO, 300);
});

test("passar do tempo continua a contar, em negativo", () => {
  // Uma entrevista que correu bem alonga-se. Quem a conduz tem de saber
  // quanto, e por isso o relógio não pára no zero.
  const r = estadoDoRelogio(INICIO, 30, T(33));
  assert.equal(r.segundos, -180);
  assert.equal(r.texto, "-03:00");
  assert.equal(r.fase, "esgotado");
});

test("a fracção trava em 1, para a barra não sair da caixa", () => {
  assert.equal(estadoDoRelogio(INICIO, 30, T(90)).fraccao, 1);
});

test("um relógio lido antes da hora não dá fracção negativa", () => {
  assert.equal(estadoDoRelogio(INICIO, 30, T(-10)).fraccao, 0);
});

test("o formato é sempre MM:SS", () => {
  assert.equal(formatar(0), "00:00");
  assert.equal(formatar(59), "00:59");
  assert.equal(formatar(61), "01:01");
  assert.equal(formatar(3600), "60:00");
  assert.equal(formatar(-5), "-00:05");
});

// ===========================================================================
// O RELÓGIO PÁRA QUANDO A ENTREVISTA ACABA
// ---------------------------------------------------------------------------
// Regressão de um erro que chegou ao utilizador: guardada a avaliação, o
// cronómetro continuava a contar. Dias depois ainda somava minutos, e quem
// abria a ficha não sabia se aquilo estava avariado ou se a entrevista tinha
// mesmo ficado aberta.
// ===========================================================================

const ABRIU = "2026-09-23T09:00:00+01:00";
const EM = (iso: string) => new Date(iso).getTime();

test("acabada, o relógio pára e mostra o tempo que durou", () => {
  // Começou às 9h00, acabou às 9h22. Trinta minutos previstos.
  const r = estadoDoRelogio(ABRIU, 30, EM("2026-09-25T18:00:00+01:00"), "2026-09-23T09:22:00+01:00");

  assert.equal(r.parado, true);
  assert.equal(r.duracaoReal, 22 * 60);
  assert.equal(r.texto, "22:00", "mostra quanto durou, não quanto falta");
});

test("dois dias depois continua a dizer o mesmo: já não conta", () => {
  const fim = "2026-09-23T09:22:00+01:00";
  const logoASeguir = estadoDoRelogio(ABRIU, 30, EM("2026-09-23T09:23:00+01:00"), fim);
  const doisDiasDepois = estadoDoRelogio(ABRIU, 30, EM("2026-09-25T18:00:00+01:00"), fim);

  assert.equal(logoASeguir.texto, doisDiasDepois.texto);
  assert.equal(logoASeguir.duracaoReal, doisDiasDepois.duracaoReal);
});

test("sem fim, continua a contar como sempre contou", () => {
  const r = estadoDoRelogio(ABRIU, 30, EM("2026-09-23T09:10:00+01:00"));
  assert.equal(r.parado, false);
  assert.equal(r.duracaoReal, null);
  assert.equal(r.texto, "20:00", "faltam 20 dos 30 minutos");
});

test("uma entrevista que passou do tempo mostra o tempo real, não o negativo", () => {
  // Prevista 30, durou 47. O que interessa a quem lê depois é o 47.
  const r = estadoDoRelogio(ABRIU, 30, EM("2026-09-24T10:00:00+01:00"), "2026-09-23T09:47:00+01:00");
  assert.equal(r.texto, "47:00");
  assert.equal(r.fase, "esgotado");
  assert.equal(r.fraccao, 1, "a barra trava no cheio em vez de sair da caixa");
});

test("um fim anterior ao início ignora-se em vez de dar tempo negativo", () => {
  const r = estadoDoRelogio(ABRIU, 30, EM("2026-09-23T09:10:00+01:00"), "2026-09-23T08:00:00+01:00");
  assert.equal(r.parado, false, "um fim impossível não pára o relógio");
  assert.ok(r.segundos > 0);
});

test("um fim que não é data nenhuma não pára o relógio", () => {
  const r = estadoDoRelogio(ABRIU, 30, EM("2026-09-23T09:10:00+01:00"), "não é uma data");
  assert.equal(r.parado, false);
  assert.equal(r.texto, "20:00");
});

test("sem início não há relógio, com ou sem fim", () => {
  assert.equal(estadoDoRelogio(null, 30, Date.now(), "2026-09-23T09:22:00+01:00").inactivo, true);
});

test("uma entrevista fechada sem hora de fim não conta para sempre", () => {
  // As antigas, de quando o sistema não carimbava nada. Sem fim não se sabe
  // quanto durou - mas também não se pode continuar a somar minutos.
  // Quem decide isto é o componente, através do sinalizador `terminada`; o
  // que esta função garante é que, sem fim, ela continua a devolver "não
  // parado" em vez de inventar uma duração.
  const r = estadoDoRelogio(ABRIU, 30, EM("2026-10-15T10:00:00+01:00"), null);
  assert.equal(r.parado, false);
  assert.equal(r.duracaoReal, null, "nunca inventa uma duração que não conhece");
});

test("a hora de fim vinda da avaliação dá a duração certa", () => {
  // É assim que a migração fecha as antigas: a avaliação foi guardada às
  // 09:35, logo a entrevista durou 35 minutos.
  const r = estadoDoRelogio(ABRIU, 30, EM("2026-10-15T10:00:00+01:00"), "2026-09-23T09:35:00+01:00");
  assert.equal(r.parado, true);
  assert.equal(r.duracaoReal, 35 * 60);
  assert.equal(r.texto, "35:00");
});
