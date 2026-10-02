import { test } from "node:test";
import assert from "node:assert/strict";

import { validarCamposDinamicos } from "../validar-campos.ts";
import type { CampoFormulario } from "../../../types/formulario.ts";

test("validarCamposDinamicos: valida com sucesso campos válidos", () => {
  const campos: CampoFormulario[] = [
    {
      concursoId: "c1",
      chave: "conhece_mtbt",
      rotulo: "Conhece MT/BT?",
      tipo: "sim_nao",
      obrigatorio: true,
      ordem: 1,
    },
    {
      concursoId: "c1",
      chave: "anos_experiencia",
      rotulo: "Anos de experiência",
      tipo: "numero",
      obrigatorio: true,
      ordem: 2,
    },
    {
      concursoId: "c1",
      chave: "turno_preferido",
      rotulo: "Turno preferido",
      tipo: "seleccao",
      obrigatorio: false,
      opcoes: ["Manhã", "Tarde", "Integral"],
      ordem: 3,
    },
  ];

  const res = validarCamposDinamicos(campos, {
    conhece_mtbt: "sim",
    anos_experiencia: "4",
    turno_preferido: "Manhã",
  });

  assert.equal(res.valido, true);
  assert.equal(res.valores.conhece_mtbt, true);
  assert.equal(res.valores.anos_experiencia, 4);
  assert.equal(res.valores.turno_preferido, "Manhã");
  assert.equal(Object.keys(res.erros).length, 0);
});

test("validarCamposDinamicos: acusa erro em campos obrigatórios não preenchidos", () => {
  const campos: CampoFormulario[] = [
    {
      concursoId: "c1",
      chave: "conhece_mtbt",
      rotulo: "Conhece MT/BT?",
      tipo: "sim_nao",
      obrigatorio: true,
      ordem: 1,
    },
    {
      concursoId: "c1",
      chave: "observacoes",
      rotulo: "Observações",
      tipo: "texto",
      obrigatorio: true,
      ordem: 2,
    },
  ];

  const res = validarCamposDinamicos(campos, {});

  assert.equal(res.valido, false);
  assert.equal(res.erros.conhece_mtbt, "Escolhe Sim ou Não.");
  assert.equal(res.erros.observacoes, "Campo obrigatório.");
});

test("validarCamposDinamicos: recusa opção inválida em campo selecção", () => {
  const campos: CampoFormulario[] = [
    {
      concursoId: "c1",
      chave: "turno",
      rotulo: "Turno",
      tipo: "seleccao",
      obrigatorio: true,
      opcoes: ["Manhã", "Tarde"],
      ordem: 1,
    },
  ];

  const res = validarCamposDinamicos(campos, { turno: "Noite" });

  assert.equal(res.valido, false);
  assert.equal(res.erros.turno, "A opção escolhida não é válida.");
});

test("validarCamposDinamicos: campo opcional vazio não gera erro", () => {
  const campos: CampoFormulario[] = [
    {
      concursoId: "c1",
      chave: "nota_extra",
      rotulo: "Nota extra",
      tipo: "texto",
      obrigatorio: false,
      ordem: 1,
    },
  ];

  const res = validarCamposDinamicos(campos, { nota_extra: "  " });

  assert.equal(res.valido, true);
  assert.equal(res.valores.nota_extra, null);
});
