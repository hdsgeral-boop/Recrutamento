import { strict as assert } from "node:assert";
import { test } from "node:test";

import { filtrarEntrevistas } from "@/lib/entrevista/filtrar";
import type { LinhaEntrevista } from "@/lib/entrevista/atribuicoes";

const base = (p: Partial<LinhaEntrevista>): LinhaEntrevista => ({
  candidatoId: p.candidatoId ?? "1",
  nome: p.nome ?? "Ana Sebastião",
  email: p.email ?? "ana@x.ao",
  telefone: "244900000000",
  municipio: p.municipio ?? "Belas",
  statusCandidatura: "Aprovado",
  quando: p.quando ?? null,
  local: null,
  recrutador: p.recrutador ?? null,
  // A equipa vem do responsável quando o teste não pede outra coisa: é
  // exactamente o que acontece numa base sem a migração da equipa.
  recrutadores: p.recrutadores ?? (p.recrutador ? [p.recrutador] : []),
  estado: p.estado ?? "nao_atribuida",
  experiencia: p.experiencia ?? { grupo: "com_experiencia", origem: "rubrica", porque: "" },
  nota: p.nota ?? null,
  versaoRoteiro: null,
  avaliadoEm: null,
  pontuacaoPerfil: p.pontuacaoPerfil ?? null,
  temAtribuicao: p.temAtribuicao ?? false,
});

const LISTA: LinhaEntrevista[] = [
  base({ candidatoId: "1", nome: "Ana Sebastião", municipio: "Belas", recrutador: "joao", estado: "atribuida" }),
  base({ candidatoId: "2", nome: "Paulo Neto", municipio: "Viana", recrutador: "maria", estado: "agendada" }),
  base({
    candidatoId: "3",
    nome: "Rosa Kiala",
    municipio: "Belas",
    estado: "nao_atribuida",
    experiencia: { grupo: "sem_experiencia", origem: "formulario", porque: "" },
  }),
];

test("sem critérios devolve tudo", () => {
  assert.equal(filtrarEntrevistas(LISTA, {}).length, 3);
});

test("a procura ignora acentos", () => {
  // Quem escreve à pressa no telemóvel não põe o til.
  assert.equal(filtrarEntrevistas(LISTA, { q: "sebastiao" }).length, 1);
  assert.equal(filtrarEntrevistas(LISTA, { q: "SEBASTIÃO" }).length, 1);
});

test("a procura também apanha o recrutador e o município", () => {
  assert.equal(filtrarEntrevistas(LISTA, { q: "maria" })[0].candidatoId, "2");
  assert.equal(filtrarEntrevistas(LISTA, { q: "viana" })[0].candidatoId, "2");
});

test("sem recrutador é um filtro próprio", () => {
  const r = filtrarEntrevistas(LISTA, { recrutador: "sem" });
  assert.equal(r.length, 1);
  assert.equal(r[0].candidatoId, "3");
});

test("filtrar por recrutador dá só os dele", () => {
  assert.deepEqual(filtrarEntrevistas(LISTA, { recrutador: "joao" }).map((l) => l.candidatoId), ["1"]);
});

test("filtrar por estado, grupo e município", () => {
  assert.equal(filtrarEntrevistas(LISTA, { estado: "agendada" }).length, 1);
  assert.equal(filtrarEntrevistas(LISTA, { grupo: "sem_experiencia" }).length, 1);
  assert.equal(filtrarEntrevistas(LISTA, { municipio: "Belas" }).length, 2);
});

test("os critérios acumulam", () => {
  assert.equal(filtrarEntrevistas(LISTA, { municipio: "Belas", recrutador: "sem" }).length, 1);
  assert.equal(filtrarEntrevistas(LISTA, { municipio: "Belas", recrutador: "maria" }).length, 0);
});

test("o filtro de base da página aplica-se antes dos outros", () => {
  // A página das Agendadas nunca pode mostrar uma não atribuída, por mais
  // que se filtre.
  const r = filtrarEntrevistas(LISTA, { municipio: "Belas" }, ["agendada"]);
  assert.equal(r.length, 0);
});

test("uma procura só com espaços não filtra nada", () => {
  assert.equal(filtrarEntrevistas(LISTA, { q: "   " }).length, 3);
});

test("filtrar por recrutador encontra quem é o SEGUNDO da equipa", () => {
  // É a razão de ser das equipas: quem entrevista com outra pessoa tem de
  // encontrar essa entrevista quando procura as suas.
  const comEquipa = [
    base({ candidatoId: "9", recrutador: "maria", recrutadores: ["maria", "joao"] }),
    base({ candidatoId: "10", recrutador: "maria", recrutadores: ["maria"] }),
  ];
  assert.deepEqual(
    filtrarEntrevistas(comEquipa, { recrutador: "joao" }).map((l) => l.candidatoId),
    ["9"]
  );
  assert.deepEqual(
    filtrarEntrevistas(comEquipa, { recrutador: "maria" }).map((l) => l.candidatoId),
    ["9", "10"]
  );
});

test("a procura por texto também apanha o segundo recrutador", () => {
  const comEquipa = [base({ candidatoId: "9", recrutador: "maria", recrutadores: ["maria", "joao"] })];
  assert.equal(filtrarEntrevistas(comEquipa, { procura: "joao" }).length, 1);
});
