import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizarSlug,
  extrairSlugDoHost,
  concursoDosCabecalhos,
  CABECALHO_CONCURSO_ID,
  CABECALHO_CONCURSO_SLUG,
} from "../concurso-contexto.ts";

test("normalizarSlug: transforma texto em slug limpo sem acentos e com hífen", () => {
  assert.equal(normalizarSlug("Técnico de Cadastro 2026!"), "tecnico-de-cadastro-2026");
  assert.equal(normalizarSlug("  Bengo_Consulvolt  "), "bengo-consulvolt");
  assert.equal(normalizarSlug("UGP—Fase 1"), "ugp-fase-1"); // travessão convertido em hífen
});

test("extrairSlugDoHost: extrai subdomínio de produção", () => {
  assert.equal(extrairSlugDoHost("bengo.recrutar.co.ao"), "bengo");
  assert.equal(extrairSlugDoHost("ugp.recrutar.co.ao"), "ugp");
  assert.equal(extrairSlugDoHost("epal-2027.recrutar.co.ao"), "epal-2027");
});

test("extrairSlugDoHost: lida com portas e espaços", () => {
  assert.equal(extrairSlugDoHost("bengo.recrutar.co.ao:443"), "bengo");
  assert.equal(extrairSlugDoHost("  bengo.recrutar.co.ao  "), "bengo");
});

test("extrairSlugDoHost: extrai em ambiente de desenvolvimento local", () => {
  assert.equal(extrairSlugDoHost("bengo.localhost:3000"), "bengo");
  assert.equal(extrairSlugDoHost("ugp.localhost"), "ugp");
  assert.equal(extrairSlugDoHost("localhost:3000"), null);
});

test("extrairSlugDoHost: domínio raiz devolve null", () => {
  assert.equal(extrairSlugDoHost("recrutar.co.ao"), null);
  assert.equal(extrairSlugDoHost("www.recrutar.co.ao"), "www");
  assert.equal(extrairSlugDoHost(null), null);
  assert.equal(extrairSlugDoHost(""), null);
});

test("concursoDosCabecalhos: lê cabeçalhos injectados pelo middleware", () => {
  const headers = new Headers();
  headers.set(CABECALHO_CONCURSO_ID, "uuid-concurso-bengo");
  headers.set(CABECALHO_CONCURSO_SLUG, "bengo");

  const res = concursoDosCabecalhos(headers);
  assert.equal(res.id, "uuid-concurso-bengo");
  assert.equal(res.slug, "bengo");
});

test("concursoDosCabecalhos: devolve null se vazios ou ausentes", () => {
  const headers = new Headers();
  const res = concursoDosCabecalhos(headers);
  assert.equal(res.id, null);
  assert.equal(res.slug, null);
});
