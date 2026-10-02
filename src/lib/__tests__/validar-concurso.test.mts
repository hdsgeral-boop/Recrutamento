import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validarDadosConcurso,
  type NovoConcursoInput,
} from "../concurso/validar.ts";

test("validarDadosConcurso: aceita dados válidos e normaliza o slug", () => {
  const entrada: NovoConcursoInput = {
    nome: "Técnico de Redes EPAL 2027",
    slug: "Epal_2027",
    vagaTitulo: "Técnico de Manutenção",
    vagasPrevistas: 30,
    prazoCandidaturas: "2027-12-31T23:59:59Z",
    rubricaVersao: "padrao-v1",
  };

  const resultado = validarDadosConcurso(entrada);
  assert.equal(resultado.valido, true);
  assert.equal(resultado.erros, null);
  assert.equal(resultado.dados?.slug, "epal-2027");
  assert.equal(resultado.dados?.vagasPrevistas, 30);
});

test("validarDadosConcurso: recusa nome demasiado curto ou vazio", () => {
  const resultado = validarDadosConcurso({
    nome: "AB",
    slug: "concurso-teste",
    vagaTitulo: "Vaga",
    vagasPrevistas: 10,
    prazoCandidaturas: "2027-12-31T23:59:59Z",
  });

  assert.equal(resultado.valido, false);
  assert.ok(resultado.erros?.nome);
});

test("validarDadosConcurso: recusa número de vagas menor que 1", () => {
  const resultado = validarDadosConcurso({
    nome: "Concurso Teste Vagas",
    slug: "concurso-teste",
    vagaTitulo: "Vaga",
    vagasPrevistas: 0,
    prazoCandidaturas: "2027-12-31T23:59:59Z",
  });

  assert.equal(resultado.valido, false);
  assert.ok(resultado.erros?.vagasPrevistas);
});

test("validarDadosConcurso: gera slug a partir do nome se o slug estiver vazio", () => {
  const resultado = validarDadosConcurso({
    nome: "Técnico Solar 2026",
    slug: "",
    vagaTitulo: "Técnico Solar",
    vagasPrevistas: 5,
    prazoCandidaturas: "2027-12-31T23:59:59Z",
  });

  assert.equal(resultado.valido, true);
  assert.equal(resultado.dados?.slug, "tecnico-solar-2026");
});
