import { test } from "node:test";
import assert from "node:assert/strict";

import {
  distribuir, gerarVagas, vagasPorDia, validarParametros, agruparPorDia,
  diaDaSemana, somarDias, PARAMETROS_PADRAO, type ParametrosAgenda,
} from "../agenda.ts";

/**
 * ===========================================================================
 * O MOTOR DE AGENDAMENTO
 * ---------------------------------------------------------------------------
 * Um engano aqui manda pessoas ao sítio à hora errada, ou marca duas no mesmo
 * lugar. Por isso cada regra tem aqui o número escrito à mão, e há uma prova
 * de que não há sobreposições.
 * ===========================================================================
 */

const base = (over: Partial<ParametrosAgenda> = {}): ParametrosAgenda => ({
  dataInicio: "2026-09-21", // uma segunda-feira
  ...PARAMETROS_PADRAO,
  ...over,
});

// --------------------------------------------------------------- CALENDÁRIO

test("21 de Setembro de 2026 é segunda-feira", () => {
  assert.equal(diaDaSemana("2026-09-21"), 1);
  assert.equal(diaDaSemana("2026-09-26"), 6); // sábado
  assert.equal(diaDaSemana("2026-09-27"), 0); // domingo
});

test("somar dias atravessa a mudança de mês sem se perder", () => {
  assert.equal(somarDias("2026-09-30", 1), "2026-10-01");
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
});

// ------------------------------------------------------------- CAPACIDADE

test("conta certo quantas entrevistas cabem num dia", () => {
  // Manhã 08:30-12:30 são 240 min, tarde 14:00-17:00 são 180 min.
  // A 30 minutos: 8 de manhã e 6 à tarde = 14 por sala. Com 2 salas, 28.
  assert.equal(vagasPorDia(base()), 28);
  assert.equal(vagasPorDia(base({ salas: 1 })), 14);
  assert.equal(vagasPorDia(base({ duracaoMinutos: 60 })), (4 + 3) * 2);
});

test("o intervalo entre entrevistas reduz a capacidade", () => {
  // 30+10 = passo de 40. Manhã: (240+10)/40 = 6. Tarde: (180+10)/40 = 4.
  assert.equal(vagasPorDia(base({ intervaloMinutos: 10, salas: 1 })), 10);
});

// ------------------------------------------------------------- VALIDAÇÃO

test("recusa parâmetros impossíveis, em vez de devolver uma agenda vazia sem explicação", () => {
  assert.ok(validarParametros(base({ salas: 0 })).length);
  assert.ok(validarParametros(base({ duracaoMinutos: 0 })).length);
  assert.ok(validarParametros(base({ diasDaSemana: [] })).length);
  assert.ok(validarParametros(base({ periodos: [{ inicio: "17:00", fim: "09:00" }] })).length);
  assert.equal(validarParametros(base()).length, 0);
});

test("avisa quando a entrevista não cabe no período", () => {
  const erros = validarParametros(base({ duracaoMinutos: 240, periodos: [{ inicio: "09:00", fim: "11:00" }] }));
  assert.ok(erros.some((e) => /não cabe|Nenhum período/i.test(e)), erros.join(" | "));
});

// ----------------------------------------------------------------- VAGAS

test("as vagas começam à hora certa, em hora de Angola", () => {
  const v = gerarVagas(base({ salas: 1 }), 3);
  // 08:30 em Angola são 07:30 em UTC.
  assert.equal(v[0].inicio, "2026-09-21T07:30:00.000Z");
  assert.equal(v[0].fim, "2026-09-21T08:00:00.000Z");
  assert.equal(v[1].inicio, "2026-09-21T08:00:00.000Z");
  assert.equal(v[2].inicio, "2026-09-21T08:30:00.000Z");
});

test("enche todas as salas na mesma hora antes de passar à hora seguinte", () => {
  const v = gerarVagas(base({ salas: 3 }), 6);
  assert.deepEqual(v.slice(0, 3).map((x) => x.sala), [1, 2, 3]);
  assert.equal(v[0].inicio, v[1].inicio);
  assert.equal(v[1].inicio, v[2].inicio);
  assert.notEqual(v[3].inicio, v[0].inicio);
});

test("salta a pausa de almoço", () => {
  const v = gerarVagas(base({ salas: 1 }), 9);
  // A oitava vaga é a última da manhã, às 12:00. A nona já é às 14:00.
  assert.equal(v[7].inicio, "2026-09-21T11:00:00.000Z"); // 12:00 Angola
  assert.equal(v[8].inicio, "2026-09-21T13:00:00.000Z"); // 14:00 Angola
});

test("nenhuma entrevista passa da hora de fecho", () => {
  const v = gerarVagas(base({ salas: 1, duracaoMinutos: 50 }), 100);
  for (const vaga of v) {
    const fim = new Date(vaga.fim);
    const horaAngola = (fim.getUTCHours() + 1) % 24;
    const minutos = horaAngola * 60 + fim.getUTCMinutes();
    assert.ok(minutos <= 12 * 60 + 30 || (minutos >= 14 * 60 && minutos <= 17 * 60),
      `vaga a acabar fora do horário: ${vaga.fim}`);
  }
});

test("salta fins-de-semana e dias de excepção", () => {
  const v = gerarVagas(base({ salas: 1, excepcoes: ["2026-09-22"] }), 60);
  const dias = new Set(v.map((x) => x.dia));
  assert.ok(!dias.has("2026-09-22"), "o dia de excepção foi usado");
  assert.ok(!dias.has("2026-09-26"), "usou um sábado");
  assert.ok(!dias.has("2026-09-27"), "usou um domingo");
});

test("com sábado incluído, o sábado entra", () => {
  const v = gerarVagas(base({ salas: 1, diasDaSemana: [1, 2, 3, 4, 5, 6] }), 100);
  assert.ok(new Set(v.map((x) => x.dia)).has("2026-09-26"));
});

// ---------------------------------------------------- NÃO HÁ SOBREPOSIÇÕES

test("nunca marca duas pessoas na mesma sala à mesma hora", () => {
  const candidatos = Array.from({ length: 120 }, (_, i) => `cand-${i}`);
  const g = distribuir(candidatos, base({ salas: 3 }));

  const ocupado = new Set<string>();
  for (const m of g.marcacoes) {
    const chave = `${m.vaga.inicio}|${m.vaga.sala}`;
    assert.ok(!ocupado.has(chave), `sobreposição em ${chave}`);
    ocupado.add(chave);
  }
  assert.equal(g.marcacoes.length, 120);
});

test("cada candidato aparece uma vez e uma só", () => {
  const candidatos = Array.from({ length: 45 }, (_, i) => `c${i}`);
  const g = distribuir(candidatos, base());
  assert.equal(new Set(g.marcacoes.map((m) => m.candidato)).size, 45);
});

// ------------------------------------------------------------- RECÁLCULO

test("os mesmos parâmetros dão sempre exactamente a mesma grelha", () => {
  const candidatos = ["a", "b", "c", "d", "e"];
  const um = distribuir(candidatos, base());
  const dois = distribuir(candidatos, base());
  assert.deepEqual(um.marcacoes, dois.marcacoes);
});

test("dobrar as salas aperta a agenda em menos dias", () => {
  const candidatos = Array.from({ length: 56 }, (_, i) => `c${i}`);
  const uma = distribuir(candidatos, base({ salas: 1 }));
  const duas = distribuir(candidatos, base({ salas: 2 }));
  assert.equal(uma.diasUsados.length, 4);
  assert.equal(duas.diasUsados.length, 2);
});

test("alongar a entrevista alarga a agenda", () => {
  const candidatos = Array.from({ length: 28 }, (_, i) => `c${i}`);
  assert.equal(distribuir(candidatos, base()).diasUsados.length, 1);
  assert.equal(distribuir(candidatos, base({ duracaoMinutos: 60 })).diasUsados.length, 2);
});

// ---------------------------------------------------------------- SOBRAS

test("quem não cabe no horizonte vem separado, em vez de desaparecer", () => {
  const candidatos = Array.from({ length: 50 }, (_, i) => `c${i}`);
  const g = distribuir(candidatos, base({ salas: 1 }), 1); // um dia só: 14 vagas
  assert.equal(g.marcacoes.length, 14);
  assert.equal(g.sobram.length, 36);
  assert.equal(g.marcacoes.length + g.sobram.length, 50);
});

test("parâmetros inválidos não marcam ninguém e devolvem toda a gente", () => {
  const candidatos = ["a", "b", "c"];
  const g = distribuir(candidatos, base({ salas: 0 }));
  assert.equal(g.marcacoes.length, 0);
  assert.deepEqual(g.sobram, candidatos);
});

test("sem candidatos não rebenta", () => {
  const g = distribuir([], base());
  assert.equal(g.marcacoes.length, 0);
  assert.equal(g.diasUsados.length, 0);
});

// -------------------------------------------------------------- AGRUPAR

test("agrupar por dia devolve os dias por ordem e as horas por ordem", () => {
  const candidatos = Array.from({ length: 40 }, (_, i) => `c${i}`);
  const dias = agruparPorDia(distribuir(candidatos, base()));
  assert.deepEqual(dias.map((d) => d.dia), ["2026-09-21", "2026-09-22"]);
  assert.equal(dias[0].marcacoes.length, 28);

  const horas = dias[0].marcacoes.map((m) => m.vaga.inicio);
  assert.deepEqual(horas, [...horas].sort());
});
