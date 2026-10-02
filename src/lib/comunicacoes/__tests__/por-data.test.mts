import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  diaEmAngola,
  diasComActividade,
  hojeEmAngola,
  horaEmAngola,
  ligarAoEvento,
  listarPorData,
  resumirDia,
  type EmailParaLista,
  type EventoParaLista,
} from "@/lib/comunicacoes/por-data";

const email = (p: Partial<EmailParaLista> = {}): EmailParaLista => ({
  id: "e1", candidatoId: "c1", enviadoEm: "2026-09-18T10:00:00+01:00",
  tipo: "entrevista", destinatario: "a@b.ao", assunto: "Entrevista marcada",
  estado: "enviado", erro: null, enviadoPor: "admin", ...p,
});

const evento = (p: Partial<EventoParaLista> = {}): EventoParaLista => ({
  candidatoId: "c1", fase: "entrevista",
  quando: "2026-09-23T09:00:00+01:00", criadoEm: "2026-09-18T10:00:00+01:00",
  local: "Escritório", ...p,
});

/* ════════════════════════════ DIA E HORA EM ANGOLA ═════════════════════ */

test("o dia é o de Angola, não o do servidor em UTC", () => {
  // 23:30 UTC do dia 22 já é dia 23 em Angola (UTC+1).
  assert.equal(diaEmAngola("2026-09-22T23:30:00Z"), "2026-09-23");
  assert.equal(diaEmAngola("2026-09-22T22:30:00Z"), "2026-09-22");
});

test("a hora também sai em hora de Angola", () => {
  assert.equal(horaEmAngola("2026-09-23T08:00:00Z"), "09:00");
});

test("uma data que não é data não rebenta nada", () => {
  assert.equal(diaEmAngola("lixo"), null);
  assert.equal(diaEmAngola(null), null);
  assert.equal(horaEmAngola(undefined), null);
});

test("hoje sai no formato do campo de data", () => {
  assert.match(hojeEmAngola(Date.parse("2026-09-22T23:30:00Z")), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(hojeEmAngola(Date.parse("2026-09-22T23:30:00Z")), "2026-09-23");
});

/* ═══════════════════ LIGAR O EMAIL À MARCAÇÃO CERTA ════════════════════ */

test("liga o email à marcação que existia quando ele saiu", () => {
  const r = ligarAoEvento(email(), [evento()]);
  assert.equal(r?.quando, "2026-09-23T09:00:00+01:00");
});

test("uma remarcação POSTERIOR não rouba o email à marcação original", () => {
  // O email saiu a 18 a convocar para 23. A 25 remarcou-se para 30.
  // Sem esta regra, o email do dia 18 apareceria na lista do dia 30.
  const original = evento({ quando: "2026-09-23T09:00:00+01:00", criadoEm: "2026-09-18T10:00:00+01:00" });
  const remarcado = evento({ quando: "2026-09-30T09:00:00+01:00", criadoEm: "2026-09-25T08:00:00+01:00" });
  const r = ligarAoEvento(email(), [remarcado, original]);
  assert.equal(r?.quando, "2026-09-23T09:00:00+01:00");
});

test("o email da remarcação liga-se à marcação nova", () => {
  const original = evento({ quando: "2026-09-23T09:00:00+01:00", criadoEm: "2026-09-18T10:00:00+01:00" });
  const remarcado = evento({ quando: "2026-09-30T09:00:00+01:00", criadoEm: "2026-09-25T08:00:00+01:00" });
  const r = ligarAoEvento(email({ enviadoEm: "2026-09-25T08:00:00+01:00" }), [original, remarcado]);
  assert.equal(r?.quando, "2026-09-30T09:00:00+01:00");
});

test("aguenta os milissegundos trocados entre a marcação e o email", () => {
  // A marcação foi gravada 20 segundos DEPOIS do email, no mesmo pedido.
  const r = ligarAoEvento(
    email({ enviadoEm: "2026-09-18T10:00:00+01:00" }),
    [evento({ criadoEm: "2026-09-18T10:00:20+01:00" })]
  );
  assert.ok(r);
});

test("empatando na criação, ganha a fase mais perto do envio", () => {
  // Entrevista e formação marcadas no mesmo lote.
  const entrevista = evento({ fase: "entrevista", quando: "2026-09-23T09:00:00+01:00" });
  const formacao = evento({ fase: "formacao", quando: "2026-10-15T09:00:00+01:00" });
  assert.equal(ligarAoEvento(email(), [formacao, entrevista])?.fase, "entrevista");
});

test("sem marcação nenhuma, o email fica sem encontro e não inventa um", () => {
  assert.equal(ligarAoEvento(email(), []), null);
  // Uma marcação feita depois do email não conta.
  assert.equal(ligarAoEvento(email(), [evento({ criadoEm: "2026-09-19T10:00:00+01:00" })]), null);
});

/* ═══════════════════════════════ A LISTA ═══════════════════════════════ */

const EMAILS = [
  email({ id: "e1", candidatoId: "c1", enviadoEm: "2026-09-18T10:00:00+01:00" }),
  email({ id: "e2", candidatoId: "c2", enviadoEm: "2026-09-18T11:00:00+01:00" }),
  email({ id: "e3", candidatoId: "c3", enviadoEm: "2026-09-19T09:00:00+01:00" }),
  email({ id: "e4", candidatoId: "c4", enviadoEm: "2026-09-18T12:00:00+01:00", estado: "erro", erro: "caixa cheia" }),
  email({ id: "e5", candidatoId: "c5", enviadoEm: "2026-09-18T13:00:00+01:00", tipo: "confirmacao" }),
];

const EVENTOS = [
  evento({ candidatoId: "c1", quando: "2026-09-23T09:00:00+01:00", criadoEm: "2026-09-18T10:00:00+01:00" }),
  evento({ candidatoId: "c2", quando: "2026-09-23T10:00:00+01:00", criadoEm: "2026-09-18T11:00:00+01:00" }),
  evento({ candidatoId: "c3", quando: "2026-09-24T09:00:00+01:00", criadoEm: "2026-09-19T09:00:00+01:00" }),
  evento({ candidatoId: "c4", fase: "formacao", quando: "2026-09-23T14:00:00+01:00", criadoEm: "2026-09-18T12:00:00+01:00" }),
];

const base = { fases: [], tipos: [], comFalhados: false } as const;

test("por data de ENVIO apanha o que saiu naquele dia", () => {
  const r = listarPorData(EMAILS, EVENTOS, { ...base, dia: "2026-09-18", criterio: "enviado" });
  assert.deepEqual(r.map((l) => l.email.id), ["e1", "e2", "e5"]);
});

test("por data do ENCONTRO apanha quem foi convocado para aquele dia", () => {
  const r = listarPorData(EMAILS, EVENTOS, { ...base, dia: "2026-09-23", criterio: "marcado" });
  // e5 não tem marcação; e4 falhou e está fora por omissão; e3 é do dia 24.
  assert.deepEqual(r.map((l) => l.email.id), ["e1", "e2"]);
});

test("as duas datas dão listas diferentes - é para isso que existem as duas", () => {
  const porEnvio = listarPorData(EMAILS, EVENTOS, { ...base, dia: "2026-09-18", criterio: "enviado" });
  const porEncontro = listarPorData(EMAILS, EVENTOS, { ...base, dia: "2026-09-18", criterio: "marcado" });
  assert.equal(porEnvio.length, 3);
  assert.equal(porEncontro.length, 0); // ninguém tem encontro marcado para 18
});

test("os falhados só entram quando se pede", () => {
  const sem = listarPorData(EMAILS, EVENTOS, { ...base, dia: "2026-09-18", criterio: "enviado" });
  const com = listarPorData(EMAILS, EVENTOS, { ...base, dia: "2026-09-18", criterio: "enviado", comFalhados: true });
  assert.ok(!sem.some((l) => l.email.id === "e4"));
  assert.ok(com.some((l) => l.email.id === "e4"));
});

test("filtrar por fase deixa de fora quem não tem essa marcação", () => {
  const r = listarPorData(EMAILS, EVENTOS, {
    ...base, dia: "2026-09-18", criterio: "enviado", comFalhados: true, fases: ["formacao"],
  });
  assert.deepEqual(r.map((l) => l.email.id), ["e4"]);
});

test("filtrar por tipo de email funciona sozinho", () => {
  const r = listarPorData(EMAILS, EVENTOS, {
    ...base, dia: "2026-09-18", criterio: "enviado", tipos: ["confirmacao"],
  });
  assert.deepEqual(r.map((l) => l.email.id), ["e5"]);
});

test("um dia sem nada devolve lista vazia, não um erro", () => {
  assert.deepEqual(listarPorData(EMAILS, EVENTOS, { ...base, dia: "2026-01-01", criterio: "enviado" }), []);
  assert.deepEqual(listarPorData([], [], { ...base, dia: "2026-09-18", criterio: "enviado" }), []);
});

test("por encontro, a lista vem pela hora do encontro", () => {
  const r = listarPorData(EMAILS, EVENTOS, {
    ...base, dia: "2026-09-23", criterio: "marcado", comFalhados: true,
  });
  assert.deepEqual(r.map((l) => horaEmAngola(l.evento!.quando)), ["09:00", "10:00", "14:00"]);
});

/* ══════════════════════════════ O RESUMO ═══════════════════════════════ */

test("o resumo conta envios, pessoas, encontros e falhas", () => {
  const r = listarPorData(EMAILS, EVENTOS, {
    ...base, dia: "2026-09-18", criterio: "enviado", comFalhados: true,
  });
  const s = resumirDia(r);
  assert.equal(s.total, 4);
  assert.equal(s.enviados, 3);
  assert.equal(s.falhados, 1);
  assert.equal(s.pessoas, 4);
  assert.equal(s.encontros, 3); // e5 não tem marcação
  assert.deepEqual(s.porFase, [{ fase: "entrevista", quantos: 2 }, { fase: "formacao", quantos: 1 }]);
});

test("o mesmo candidato duas vezes conta como uma pessoa", () => {
  const dois = [
    email({ id: "a", candidatoId: "c1" }),
    email({ id: "b", candidatoId: "c1", tipo: "confirmacao" }),
  ];
  const s = resumirDia(listarPorData(dois, [], { ...base, dia: "2026-09-18", criterio: "enviado" }));
  assert.equal(s.total, 2);
  assert.equal(s.pessoas, 1);
});

test("resumir uma lista vazia dá zeros, não NaN", () => {
  const s = resumirDia([]);
  assert.deepEqual(
    [s.total, s.enviados, s.falhados, s.pessoas, s.encontros, s.porFase.length],
    [0, 0, 0, 0, 0, 0]
  );
});

/* ═══════════════════════════ DIAS SUGERIDOS ════════════════════════════ */

test("sugere os dias que têm mesmo alguma coisa, do mais recente ao mais antigo", () => {
  assert.deepEqual(diasComActividade(EMAILS, EVENTOS, "enviado"), ["2026-09-19", "2026-09-18"]);
  assert.deepEqual(diasComActividade(EMAILS, EVENTOS, "marcado"), ["2026-09-24", "2026-09-23"]);
});
