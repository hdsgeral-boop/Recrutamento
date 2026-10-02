import test from "node:test";
import assert from "node:assert/strict";

import {
  obterRubrica,
  listarRubricas,
  REGISTO_RUBRICAS,
  type RubricaAvaliacao,
} from "../registo-rubricas.ts";
import type { DadosFormulario, Extraccao } from "../tipos.ts";

const FORMULARIO_BASE: DadosFormulario = {
  provincia: "Bengo",
  municipio: "Caxito",
  tem_carta: true,
  conhece_mtbt: true,
  experiencia_similar: true,
  nivel_academico: "Técnico Médio (12.ª classe)",
  curso: "Electricidade",
  temCv: true,
  temBi: true,
  temCertificado: true,
  temComprovativoExperiencia: true,
};

test("obterRubrica: devolve a rubrica bengo-v1 por defeito ou quando solicitada", () => {
  const rubrica = obterRubrica("bengo-v1");
  assert.equal(rubrica.versao, "bengo-v1");
  assert.equal(rubrica.totalMaximo, 100);
  assert.equal(typeof rubrica.calcularPontuacao, "function");
});

test("obterRubrica: fallback seguro quando a versão é desconhecida ou nula", () => {
  const rubricaDesconhecida = obterRubrica("inexistente-xyz");
  assert.equal(rubricaDesconhecida.versao, "padrao-v1");

  const rubricaNula = obterRubrica(null);
  assert.equal(rubricaNula.versao, "padrao-v1");

  const rubricaVazia = obterRubrica("");
  assert.equal(rubricaVazia.versao, "padrao-v1");
});

test("obterRubrica: suporta rubrica padrao-v1", () => {
  const rubrica = obterRubrica("padrao-v1");
  assert.equal(rubrica.versao, "padrao-v1");
  assert.equal(rubrica.totalMaximo, 100);
});

test("listarRubricas: devolve lista formatada das rubricas registadas", () => {
  const lista = listarRubricas();
  assert.ok(lista.length >= 2);
  const versoes = lista.map((r: { versao: string }) => r.versao);
  assert.ok(versoes.includes("bengo-v1"));
  assert.ok(versoes.includes("padrao-v1"));
});

test("rubricas registadas produzem pontuação válida com extraccaoVazia", () => {
  for (const [versao, rubrica] of Object.entries(REGISTO_RUBRICAS) as [string, RubricaAvaliacao][]) {
    const vazia = rubrica.extraccaoVazia();
    const resultado = rubrica.calcularPontuacao(FORMULARIO_BASE, vazia);
    assert.equal(resultado.versao, versao);
    assert.equal(typeof resultado.total, "number");
    assert.ok(resultado.total >= 0 && resultado.total <= rubrica.totalMaximo);
    assert.ok(Array.isArray(resultado.criterios));
    assert.ok(Array.isArray(resultado.alertas));
  }
});
