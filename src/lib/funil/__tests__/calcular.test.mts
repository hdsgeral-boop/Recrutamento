import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  calcularFunil,
  chaveDoEstado,
  contarPorEstado,
  largurasDaPiramide,
  maiorPerda,
  precisosPorNivel,
} from "@/lib/funil/calcular";
import { ESTADOS_PADRAO, NIVEIS_PADRAO } from "@/lib/funil/padrao";

/* ═══════════════════════════ QUANTOS SÃO PRECISOS ═══════════════════════ */

test("reproduz a cadeia do piloto do Bengo: 58 contratados pedem 290 candidaturas", () => {
  const p = precisosPorNivel(NIVEIS_PADRAO, 58);
  assert.deepEqual(p, [290, 159, 111, 83, 73, 69, 58]);
});

test("alvo zero não pede ninguém em degrau nenhum", () => {
  assert.deepEqual(precisosPorNivel(NIVEIS_PADRAO, 0), [0, 0, 0, 0, 0, 0, 0]);
});

test("arredonda sempre para cima - meia pessoa não vai a uma entrevista", () => {
  const niveis = [
    { ...NIVEIS_PADRAO[0], ordem: 1, taxaPrevista: null },
    { ...NIVEIS_PADRAO[1], ordem: 2, taxaPrevista: 50 },
  ];
  // 3 / 0,5 = 6 certinho; 4 / 0,5 = 8. Com 5 e 30% dá 16,66 -> 17.
  assert.deepEqual(precisosPorNivel(niveis, 3), [6, 3]);
  assert.deepEqual(precisosPorNivel([{ ...niveis[0] }, { ...niveis[1], taxaPrevista: 30 }], 5), [17, 5]);
});

test("um degrau sem taxa não inventa necessidade: herda o número seguinte", () => {
  const niveis = [
    { ...NIVEIS_PADRAO[0], ordem: 1, taxaPrevista: null },
    { ...NIVEIS_PADRAO[1], ordem: 2, taxaPrevista: null },
  ];
  assert.deepEqual(precisosPorNivel(niveis, 10), [10, 10]);
});

test("níveis desligados saem da conta", () => {
  const niveis = NIVEIS_PADRAO.map((n) =>
    n.chave === "teste_fluxo" ? { ...n, activo: false } : n
  );
  const p = precisosPorNivel(niveis, 58);
  assert.equal(p.length, 6);
  assert.equal(p[p.length - 1], 58);
});

/* ═════════════════════════════ ESTADOS E ALIASES ════════════════════════ */

test("o vocabulário antigo continua a contar: Pendente é Identificado", () => {
  assert.equal(chaveDoEstado("Pendente", ESTADOS_PADRAO), "Identificado");
  assert.equal(chaveDoEstado("Aprovado", ESTADOS_PADRAO), "Seleccionado");
  assert.equal(chaveDoEstado("Reprovado", ESTADOS_PADRAO), "Recusado");
});

test("o nome novo também conta, e maiúsculas não fazem diferença", () => {
  assert.equal(chaveDoEstado("Contactado", ESTADOS_PADRAO), "Contactado");
  assert.equal(chaveDoEstado("  seleccionado ", ESTADOS_PADRAO), "Seleccionado");
});

test("um estado que ninguém configurou não é atirado para dentro de outro", () => {
  assert.equal(chaveDoEstado("Inventado", ESTADOS_PADRAO), null);
  assert.equal(chaveDoEstado(null, ESTADOS_PADRAO), null);
  assert.equal(chaveDoEstado("", ESTADOS_PADRAO), null);
});

test("a chave própria ganha ao alias de outro estado", () => {
  const estados = [
    { ...ESTADOS_PADRAO[0], chave: "Contactado", aliases: [] },
    { ...ESTADOS_PADRAO[1], chave: "Outro", aliases: ["Contactado"] },
  ];
  assert.equal(chaveDoEstado("Contactado", estados), "Contactado");
});

test("contar por estado devolve zero para os estados sem ninguém", () => {
  const c = contarPorEstado(
    [{ status: "Pendente" }, { status: "Pendente" }, { status: "Contactado" }],
    ESTADOS_PADRAO
  );
  assert.equal(c.get("Identificado"), 2);
  assert.equal(c.get("Contactado"), 1);
  assert.equal(c.get("Contratado"), 0);
});

/* ═══════════════════════════════ O FUNIL ════════════════════════════════ */

const POVO = [
  ...Array.from({ length: 10 }, () => ({ status: "Pendente" })),
  ...Array.from({ length: 6 }, () => ({ status: "Contactado" })),
  ...Array.from({ length: 4 }, () => ({ status: "Entrevistado" })),
  ...Array.from({ length: 2 }, () => ({ status: "Aprovado" })),
  { status: "Contratado" },
  { status: "Reprovado" },
];

test("o funil conta cada degrau como quem já lá chegou ou passou", () => {
  const f = calcularFunil(POVO, NIVEIS_PADRAO, ESTADOS_PADRAO, 58);

  // Candidaturas = todos menos os terminais (Recusado).
  assert.equal(f[0].tem, 23);
  assert.equal(f[1].tem, 13); // Contactado + Entrevistado + Seleccionado + Contratado
  assert.equal(f[2].tem, 7);
  assert.equal(f[6].tem, 1);
});

test("a taxa real é a passagem do degrau anterior, com uma casa decimal", () => {
  const f = calcularFunil(POVO, NIVEIS_PADRAO, ESTADOS_PADRAO, 58);
  assert.equal(f[0].taxaReal, null);
  assert.equal(f[1].taxaReal, 56.5); // 13/23
  assert.equal(f[2].taxaReal, 53.8); // 7/13
});

test("o desvio compara a taxa real com a prevista, em pontos", () => {
  const f = calcularFunil(POVO, NIVEIS_PADRAO, ESTADOS_PADRAO, 58);
  // Pré-selecção prevê 55% e fez 56,5%: está 1,5 pontos acima.
  assert.equal(f[1].desvio, 1.5);
  // Entrevista prevê 70% e fez 53,8%: está bem abaixo.
  assert.equal(f[2].desvio, -16.2);
});

test("sem ninguém, o funil não rebenta nem inventa percentagens", () => {
  const f = calcularFunil([], NIVEIS_PADRAO, ESTADOS_PADRAO, 58);
  assert.equal(f.length, 7);
  assert.equal(f[0].tem, 0);
  assert.equal(f[1].taxaReal, null);
  assert.equal(f[0].faltam, 290);
});

test("ter mais do que o preciso não gera um «faltam» negativo", () => {
  const muitos = Array.from({ length: 500 }, () => ({ status: "Pendente" }));
  const f = calcularFunil(muitos, NIVEIS_PADRAO, ESTADOS_PADRAO, 58);
  assert.equal(f[0].faltam, 0);
});

test("a maior perda aponta o degrau onde se perde mais gente", () => {
  const f = calcularFunil(POVO, NIVEIS_PADRAO, ESTADOS_PADRAO, 58);
  const pior = maiorPerda(f);
  assert.ok(pior);
  assert.equal(pior!.nivel.chave, "pre_seleccao"); // 23 -> 13, perdem-se 10
  assert.equal(pior!.perdidos, 10);
});

test("sem perdas não há gargalo a apontar", () => {
  assert.equal(maiorPerda(calcularFunil([], NIVEIS_PADRAO, ESTADOS_PADRAO, 58)), null);
});

/* ═══════════════════════════ LARGURAS DA PIRÂMIDE ══════════════════════ */

test("a pirâmide estica o intervalo para os degraus de cima se verem", () => {
  const l = largurasDaPiramide([290, 159, 111, 83, 73, 69, 58]);
  assert.equal(l[0], 100); // a base é a mais larga
  assert.equal(l[l.length - 1], 38); // o topo é o mais estreito
  // Nunca cresce ao subir: a forma é sempre a de uma pirâmide.
  assert.ok(l.every((x, i) => i === 0 || x <= l[i - 1]));
});

test("nenhum degrau desaparece, por mais pequeno que seja", () => {
  const l = largurasDaPiramide([10000, 5, 2, 1]);
  assert.ok(l.every((x) => x >= 38));
});

test("degraus todos iguais dão uma coluna, não uma pirâmide", () => {
  assert.deepEqual(largurasDaPiramide([10, 10, 10]), [100, 100, 100]);
});

test("um alvo zero não rebenta as larguras", () => {
  assert.deepEqual(largurasDaPiramide([0, 0]), [100, 100]);
  assert.deepEqual(largurasDaPiramide([]), []);
});

test("a ordem das larguras acompanha sempre a dos precisos", () => {
  const precisos = [70, 38, 26, 19, 16, 15, 12];
  const l = largurasDaPiramide(precisos);
  for (let i = 1; i < precisos.length; i++) {
    if (precisos[i] < precisos[i - 1]) assert.ok(l[i] < l[i - 1]);
    else assert.ok(l[i] <= l[i - 1]);
  }
});
