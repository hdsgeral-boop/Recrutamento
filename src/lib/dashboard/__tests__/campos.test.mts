import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  agregar,
  GRAFICOS_PADRAO,
  SEM_VALOR,
  valorDoCampo,
  type Grafico,
  type LinhaDashboard,
} from "@/lib/dashboard/campos";

const HOJE = new Date("2026-09-22T12:00:00Z");

function linha(p: Partial<LinhaDashboard> = {}): LinhaDashboard {
  return {
    id: "x", criadoEm: "2026-09-01T09:00:00Z", estado: "Contactado",
    provincia: "Luanda", municipio: "Caxito",
    nivelAcademico: "Ensino Médio (12.ª classe)", curso: null,
    experienciaSimilar: true, temCarta: false, conheceMtBt: true,
    sexo: "M", nascimento: "1990-03-12",
    pontuacao: 70, notaEntrevista: 80, recrutador: "joao",
    ...p,
  };
}

const g = (p: Partial<Grafico>): Grafico => ({
  id: "t", titulo: "t", campo: "sexo", agregacao: "contagem", feitio: "barras", topo: 8, ...p,
});

/* ════════════════════════════ VALOR DO CAMPO ════════════════════════════ */

test("traduz o sexo do BI para uma palavra legível", () => {
  assert.equal(valorDoCampo(linha({ sexo: "M" }), "sexo", HOJE), "Masculino");
  assert.equal(valorDoCampo(linha({ sexo: "F" }), "sexo", HOJE), "Feminino");
});

test("quem não tem o dado aparece como «Não indicado», nunca desaparece", () => {
  assert.equal(valorDoCampo(linha({ sexo: null }), "sexo", HOJE), SEM_VALOR);
  assert.equal(valorDoCampo(linha({ nascimento: null }), "escalao", HOJE), SEM_VALOR);
  assert.equal(valorDoCampo(linha({ municipio: null }), "municipio", HOJE), SEM_VALOR);
  assert.equal(valorDoCampo(linha({ municipio: "   " }), "municipio", HOJE), SEM_VALOR);
});

test("o escalão etário sai da data de nascimento", () => {
  assert.equal(valorDoCampo(linha({ nascimento: "1990-03-12" }), "escalao", HOJE), "35-44");
  assert.equal(valorDoCampo(linha({ nascimento: "2005-01-01" }), "escalao", HOJE), "18-24");
});

test("os sim/não ficam sim/não, e o vazio fica vazio", () => {
  assert.equal(valorDoCampo(linha({ temCarta: true }), "temCarta", HOJE), "Sim");
  assert.equal(valorDoCampo(linha({ temCarta: false }), "temCarta", HOJE), "Não");
  assert.equal(valorDoCampo(linha({ temCarta: null }), "temCarta", HOJE), SEM_VALOR);
});

test("as faixas de pontuação partem nos quartos", () => {
  assert.equal(valorDoCampo(linha({ pontuacao: 0 }), "faixaPontuacao", HOJE), "0-24");
  assert.equal(valorDoCampo(linha({ pontuacao: 24.9 }), "faixaPontuacao", HOJE), "0-24");
  assert.equal(valorDoCampo(linha({ pontuacao: 25 }), "faixaPontuacao", HOJE), "25-49");
  assert.equal(valorDoCampo(linha({ pontuacao: 100 }), "faixaPontuacao", HOJE), "75-100");
  assert.equal(valorDoCampo(linha({ pontuacao: null }), "faixaPontuacao", HOJE), SEM_VALOR);
});

test("sem recrutador diz «Por atribuir», que é accionável, e não «Não indicado»", () => {
  assert.equal(valorDoCampo(linha({ recrutador: null }), "recrutador", HOJE), "Por atribuir");
});

test("o mês da candidatura sai da data de entrada", () => {
  assert.equal(valorDoCampo(linha({ criadoEm: "2026-09-01T09:00:00Z" }), "mes", HOJE), "set/26");
  assert.equal(valorDoCampo(linha({ criadoEm: "lixo" }), "mes", HOJE), SEM_VALOR);
});

/* ═══════════════════════════════ CONTAGEM ══════════════════════════════ */

const POVO = [
  linha({ sexo: "M", municipio: "Caxito" }),
  linha({ sexo: "M", municipio: "Caxito" }),
  linha({ sexo: "F", municipio: "Dande" }),
  linha({ sexo: null, municipio: null }),
];

test("a contagem soma as linhas de cada grupo", () => {
  const a = agregar(POVO, g({ campo: "sexo" }), HOJE);
  assert.equal(a.total, 4);
  assert.deepEqual(
    a.baldes.map((b) => [b.rotulo, b.valor]),
    [["Masculino", 2], ["Feminino", 1], [SEM_VALOR, 1]]
  );
  assert.equal(a.maximo, 2);
  assert.equal(a.unidade, "");
});

test("a percentagem fecha nos 100 e traz o sinal", () => {
  const a = agregar(POVO, g({ campo: "sexo", agregacao: "percentagem" }), HOJE);
  assert.deepEqual(a.baldes.map((b) => b.valor), [50, 25, 25]);
  assert.equal(a.unidade, "%");
});

test("uma lista vazia dá um gráfico vazio, não um erro", () => {
  const a = agregar([], g({ campo: "sexo" }), HOJE);
  assert.equal(a.total, 0);
  assert.equal(a.baldes.length, 0);
  assert.equal(a.maximo, 0);
});

/* ═════════════════════════════════ MÉDIAS ══════════════════════════════ */

test("a média só divide por quem tem o número, não por todos", () => {
  const a = agregar(
    [
      linha({ experienciaSimilar: true, pontuacao: 80 }),
      linha({ experienciaSimilar: true, pontuacao: 60 }),
      linha({ experienciaSimilar: true, pontuacao: null }),
      linha({ experienciaSimilar: false, pontuacao: 40 }),
    ],
    g({ campo: "experienciaSimilar", agregacao: "mediaPontuacao" }),
    HOJE
  );
  const sim = a.baldes.find((b) => b.rotulo === "Sim")!;
  assert.equal(sim.valor, 70); // (80+60)/2, e não /3
  assert.equal(sim.quantas, 3); // mas o grupo continua a ter 3 pessoas
  assert.equal(a.semDado, 1);
  assert.equal(a.unidade, "pts");
});

test("um grupo sem nenhum número dá zero em vez de rebentar", () => {
  const a = agregar(
    [linha({ experienciaSimilar: false, pontuacao: null })],
    g({ campo: "experienciaSimilar", agregacao: "mediaPontuacao" }),
    HOJE
  );
  assert.equal(a.baldes[0].valor, 0);
});

/* ══════════════════════════════ ORDEM E CAUDA ══════════════════════════ */

test("os campos com ordem natural respeitam-na em vez de ordenar por tamanho", () => {
  const a = agregar(
    [
      linha({ nascimento: "1960-01-01" }), // 55+
      linha({ nascimento: "2005-01-01" }), // 18-24
      linha({ nascimento: "2005-06-01" }),
    ],
    g({ campo: "escalao" }),
    HOJE
  );
  assert.deepEqual(a.baldes.map((b) => b.rotulo), ["18-24", "55+"]);
});

test("nos campos livres o maior vem primeiro e o «Não indicado» vai para o fim", () => {
  const a = agregar(
    [
      linha({ municipio: null }), linha({ municipio: null }), linha({ municipio: null }),
      linha({ municipio: "Dande" }),
    ],
    g({ campo: "municipio" }),
    HOJE
  );
  assert.deepEqual(a.baldes.map((b) => b.rotulo), ["Dande", SEM_VALOR]);
});

test("a cauda junta-se em «Outros» e diz quantas categorias lá estão", () => {
  const muitos = ["A","B","C","D","E","F","G","H","I","J"].flatMap((m, i) =>
    Array.from({ length: 10 - i }, () => linha({ municipio: m }))
  );
  const a = agregar(muitos, g({ campo: "municipio", topo: 3 }), HOJE);
  assert.equal(a.baldes.length, 4);
  assert.equal(a.baldes[3].rotulo, "Outros (7)");
  assert.equal(a.baldes[3].valor, 7 + 6 + 5 + 4 + 3 + 2 + 1);
});

test("com apenas uma categoria a mais não se cria um «Outros» de um só", () => {
  const quatro = ["A", "B", "C", "D"].map((m) => linha({ municipio: m }));
  const a = agregar(quatro, g({ campo: "municipio", topo: 3 }), HOJE);
  assert.equal(a.baldes.length, 4);
  assert.ok(!a.baldes.some((b) => b.rotulo.startsWith("Outros")));
});

test("os meses ordenam-se no tempo, não por tamanho", () => {
  const a = agregar(
    [
      linha({ criadoEm: "2026-11-02T09:00:00Z" }),
      linha({ criadoEm: "2026-09-02T09:00:00Z" }),
      linha({ criadoEm: "2026-09-03T09:00:00Z" }),
      linha({ criadoEm: "2027-01-03T09:00:00Z" }),
    ],
    g({ campo: "mes", feitio: "linha" }),
    HOJE
  );
  assert.deepEqual(a.baldes.map((b) => b.rotulo), ["set/26", "nov/26", "jan/27"]);
});

/* ═══════════════════════════ GRÁFICOS DE OMISSÃO ═══════════════════════ */

test("todos os gráficos de omissão correm sem rebentar e têm id único", () => {
  const ids = new Set<string>();
  for (const graf of GRAFICOS_PADRAO) {
    assert.ok(!ids.has(graf.id), `id repetido: ${graf.id}`);
    ids.add(graf.id);
    const a = agregar(POVO, graf, HOJE);
    assert.ok(a.baldes.length > 0, graf.titulo);
  }
});
