import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularPontuacao,
  extraccaoVazia,
  TOTAL_MAXIMO,
} from "../rubrica-bengo-v1.ts";
import type { DadosFormulario, Extraccao } from "../tipos.ts";

/** Formulário mínimo, completo e válido. */
function form(over: Partial<DadosFormulario> = {}): DadosFormulario {
  return {
    provincia: "Bengo",
    municipio: "Caxito",
    tem_carta: false,
    conhece_mtbt: false,
    experiencia_similar: false,
    nivel_academico: "Ensino Médio Técnico (12.ª classe)",
    curso: null,
    temCv: true,
    temBi: true,
    temCertificado: true,
    temComprovativoExperiencia: false,
    ...over,
  };
}

function extra(over: Partial<Extraccao> = {}): Extraccao {
  return { ...extraccaoVazia(), escolaridade: { ...extraccaoVazia().escolaridade, concluiu_12a: true }, ...over };
}

const pontos = (f: DadosFormulario, e: Extraccao, codigo: string) =>
  calcularPontuacao(f, e).criterios.find((c) => c.codigo === codigo)!.pontos;

// ------------------------------------------------------------ ELIMINATÓRIO

test("elimina quem não tem 12.ª classe em lado nenhum", () => {
  const r = calcularPontuacao(
    form({ nivel_academico: "9.ª classe" }),
    extra({ escolaridade: { ...extraccaoVazia().escolaridade, concluiu_12a: false } })
  );
  assert.equal(r.eliminado, true);
  assert.equal(r.total, 0);
});

test("não elimina quando o formulário declara a 12.ª e o certificado está ilegível", () => {
  const r = calcularPontuacao(
    form(),
    extra({
      escolaridade: { ...extraccaoVazia().escolaridade, concluiu_12a: false },
      documentos_ilegiveis: ["certificado"],
    })
  );
  assert.equal(r.eliminado, false);

  // Fica uma nota a dizer que se confirma na entrevista, mas nunca um aviso:
  // o OCR não ter lido o certificado não é falta do candidato.
  const nota = r.alertas.find((a) => a.tipo === "requisito_em_falta");
  assert.ok(nota, "devia haver a nota do requisito por confirmar");
  assert.equal(nota!.gravidade, "info");
  assert.ok(nota!.mensagem.toLowerCase().includes("entrevista"));
});

test("documento ilegível não gera alerta nenhum", () => {
  const r = calcularPontuacao(
    form(),
    extra({ documentos_ilegiveis: ["cv_teste.pdf", "bi_teste.jpg"] })
  );

  assert.equal(
    r.alertas.filter((a) => a.tipo === "documento_ilegivel").length,
    0,
    "uma falha do OCR não pode encher a ficha de avisos"
  );
});

// ---------------------------------------------------------------- A (15)

test("A: cada banda da residência", () => {
  assert.equal(pontos(form({ provincia: "Bengo", municipio: "Dande" }), extra(), "A"), 15);
  assert.equal(pontos(form({ provincia: "Bengo", municipio: "Outro" }), extra(), "A"), 12);
  assert.equal(pontos(form({ provincia: "Luanda", municipio: "Cacuaco" }), extra(), "A"), 8);
  assert.equal(pontos(form({ provincia: "Luanda", municipio: "Belas" }), extra(), "A"), 4);
});

test("A: natural de município do projecto soma 2, com tecto de 12", () => {
  const e = extra({ naturalidade: { municipio: "Caxito", provincia: "Bengo" } });
  assert.equal(pontos(form({ provincia: "Luanda", municipio: "Belas" }), e, "A"), 6);
  assert.equal(pontos(form({ provincia: "Luanda", municipio: "Cacuaco" }), e, "A"), 10);
});

// --------------------------------------------------------------- B1 (14)

test("B1: cada banda do cadastro", () => {
  const com = (tipo: string) =>
    extra({
      experiencias: [
        {
          empresa: "X", funcao: "Técnico", anos: 2, trabalho_de_campo: true,
          regista_dados: false, tipo_campo: tipo as never, evidencia: "prova",
        },
      ],
    });
  assert.equal(pontos(form(), com("cadastro_censo_inquerito"), "B1"), 14);
  assert.equal(pontos(form(), com("topografia_gis"), "B1"), 13);
  assert.equal(pontos(form(), com("leitura_contadores_fiscalizacao"), "B1"), 10);
  assert.equal(pontos(form(), com("inventario_conferencia"), "B1"), 6);
  assert.equal(pontos(form(), extra(), "B1"), 0);
});

test("B1: experiência declarada sem detalhe nos documentos vale 6", () => {
  assert.equal(pontos(form({ experiencia_similar: true }), extra(), "B1"), 6);
});

// --------------------------------------------------------------- B2 (8)

test("B2: cada banda do tempo de campo", () => {
  const anos = (n: number | null) =>
    extra({
      experiencias: [
        { empresa: "X", funcao: "F", anos: n, trabalho_de_campo: true,
          regista_dados: false, tipo_campo: null, evidencia: null },
      ],
    });
  assert.equal(pontos(form(), anos(4), "B2"), 8);
  assert.equal(pontos(form(), anos(2), "B2"), 5);
  assert.equal(pontos(form(), anos(null), "B2"), 2);
  assert.equal(pontos(form(), extra(), "B2"), 0);
});

// --------------------------------------------------------------- B3 (5)

test("B3: cada banda do registo de dados", () => {
  const f = (funcao: string, regista: boolean) =>
    extra({
      experiencias: [
        { empresa: "X", funcao, anos: 1, trabalho_de_campo: false,
          regista_dados: regista, tipo_campo: null, evidencia: null },
      ],
    });
  assert.equal(pontos(form(), f("Conferente de armazém", true), "B3"), 5);
  assert.equal(pontos(form(), f("Motorista", true), "B3"), 3);
  assert.equal(pontos(form(), f("Motorista", false), "B3"), 0);
});

// --------------------------------------------------------------- B4 (3)

test("B4: cada banda da fotografia", () => {
  const nivel = (n: "formacao" | "pratica" | "nenhum") =>
    extra({ fotografia: { nivel: n, evidencia: null } });
  assert.equal(pontos(form(), nivel("formacao"), "B4"), 3);
  assert.equal(pontos(form(), nivel("pratica"), "B4"), 1);
  assert.equal(pontos(form(), nivel("nenhum"), "B4"), 0);
});

// ---------------------------------------------------------------- C (20)

test("C: cada banda da electricidade", () => {
  const n = (nivel: string) => extra({ electricidade: { nivel: nivel as never, evidencia: "prova" } });
  assert.equal(pontos(form(), n("mt_bt"), "C"), 20);
  assert.equal(pontos(form(), n("bt"), "C"), 14);
  assert.equal(pontos(form(), n("generico"), "C"), 12);
  assert.equal(pontos(form(), n("proximo"), "C"), 8);
  assert.equal(pontos(form(), n("nenhum"), "C"), 0);
});

test("C: MT/BT declarado sem prova documental vale 12 e gera alerta", () => {
  const r = calcularPontuacao(form({ conhece_mtbt: true }), extra());
  assert.equal(r.criterios.find((c) => c.codigo === "C")!.pontos, 12);
  assert.ok(r.alertas.some((a) => a.tipo === "divergencia_formulario"));
});

// ---------------------------------------------------------------- D (10)

test("D: cada banda da literacia digital", () => {
  const n = (nivel: "formacao" | "utilizador" | "nenhum") =>
    extra({ informatica: { nivel, evidencia: null } });
  assert.equal(pontos(form(), n("formacao"), "D"), 10);
  assert.equal(pontos(form(), n("utilizador"), "D"), 6);
  assert.equal(pontos(form(), n("nenhum"), "D"), 0);
});

// ---------------------------------------------------------------- E (10)

test("E: cada banda da carta", () => {
  const prof = extra({ carta_conducao: { tem: true, categoria: "Profissional C", evidencia: null } });
  assert.equal(pontos(form({ tem_carta: true }), prof, "E"), 10);
  assert.equal(pontos(form({ tem_carta: true }), extra(), "E"), 8);
  assert.equal(pontos(form({ tem_carta: false }), extra(), "E"), 0);
});

test("E: formulário manda sobre os documentos, mas fica o alerta", () => {
  const r = calcularPontuacao(
    form({ tem_carta: false }),
    extra({ carta_conducao: { tem: true, categoria: "B", evidencia: "carta" } })
  );
  assert.equal(r.criterios.find((c) => c.codigo === "E")!.pontos, 0);
  assert.ok(r.alertas.some((a) => a.tipo === "divergencia_formulario"));
});

// ---------------------------------------------------------------- F (10)

test("F: cada banda da comunicação", () => {
  const inquerito = extra({
    experiencias: [
      { empresa: "INE", funcao: "Inquiridor", anos: 1, trabalho_de_campo: true,
        regista_dados: true, tipo_campo: "cadastro_censo_inquerito", evidencia: "censos" },
    ],
  });
  assert.equal(pontos(form(), inquerito, "F"), 10);
  assert.equal(pontos(form(), extra({ atendimento_publico: { tem: true, evidencia: null } }), "F"), 6);
  assert.equal(pontos(form(), extra(), "F"), 0);
});

// ---------------------------------------------------------------- G (5)

test("G: completude soma ponto a ponto", () => {
  assert.equal(pontos(form(), extra(), "G"), 4); // CV + BI + certificado + sem incoerências
  assert.equal(
    pontos(form({ experiencia_similar: true, temComprovativoExperiencia: true }), extra(), "G"),
    5
  );
  assert.equal(pontos(form(), extra({ incoerencias: ["nomes diferentes"] }), "G"), 3);
  assert.equal(pontos(form({ temCv: false }), extra(), "G"), 3);
});

// ------------------------------------------------------------- INTEGRAÇÃO

test("candidato perfeito chega ao máximo da rubrica", () => {
  const f = form({
    provincia: "Bengo", municipio: "Dande", tem_carta: true, conhece_mtbt: true,
    experiencia_similar: true, temComprovativoExperiencia: true,
  });
  const e = extra({
    electricidade: { nivel: "mt_bt", evidencia: "MT e BT" },
    informatica: { nivel: "formacao", evidencia: "curso" },
    fotografia: { nivel: "formacao", evidencia: "curso" },
    carta_conducao: { tem: true, categoria: "Profissional D", evidencia: "carta" },
    atendimento_publico: { tem: true, evidencia: "balcão" },
    experiencias: [
      { empresa: "ENDE", funcao: "Conferente de cadastro", anos: 5, trabalho_de_campo: true,
        regista_dados: true, tipo_campo: "cadastro_censo_inquerito", evidencia: "cadastro de activos" },
    ],
  });
  const r = calcularPontuacao(f, e);
  assert.equal(r.eliminado, false);
  assert.equal(r.total, TOTAL_MAXIMO);
  assert.equal(r.criterios.length, 10);
});

test("candidato mínimo válido não rebenta e fica com poucos pontos", () => {
  const r = calcularPontuacao(
    form({ provincia: "Huambo", municipio: "Huambo", temCv: false, temBi: false, temCertificado: false }),
    extra()
  );
  assert.equal(r.eliminado, false);
  assert.ok(r.total <= 5, `esperava poucos pontos, deu ${r.total}`);
});

test("toda a pontuação cabe no máximo de cada critério", () => {
  const r = calcularPontuacao(form(), extra());
  for (const c of r.criterios) {
    assert.ok(c.pontos <= c.maximo, `${c.codigo} passou o máximo`);
    assert.ok(c.pontos >= 0, `${c.codigo} ficou negativo`);
  }
});
