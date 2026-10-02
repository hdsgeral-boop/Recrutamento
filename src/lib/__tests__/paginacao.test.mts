import { test } from "node:test";
import assert from "node:assert/strict";

import { fatiar, lerPaginacao, numerosVisiveis, POR_PAGINA_PADRAO } from "../paginacao.ts";

const lista = Array.from({ length: 47 }, (_, i) => i + 1);

test("por omissão são 10 por página", () => {
  const f = lerPaginacao({}, 47);
  assert.equal(f.porPagina, POR_PAGINA_PADRAO);
  assert.equal(f.porPagina, 10);
  assert.equal(f.pagina, 1);
  assert.equal(f.totalPaginas, 5);
  assert.deepEqual(fatiar(lista, f), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("aceita 25, 50 e 100 e recusa o resto", () => {
  for (const n of [25, 50, 100]) {
    assert.equal(lerPaginacao({ porPagina: String(n) }, 47).porPagina, n);
  }
  for (const mau of ["7", "1000", "abc", "-5", ""]) {
    assert.equal(lerPaginacao({ porPagina: mau }, 47).porPagina, 10, mau);
  }
});

test("a última página traz só o que sobra", () => {
  const f = lerPaginacao({ pagina: "5" }, 47);
  assert.equal(f.inicio, 40);
  assert.equal(f.fim, 47);
  assert.deepEqual(fatiar(lista, f), [41, 42, 43, 44, 45, 46, 47]);
});

test("uma página fora do intervalo cai na última, nunca numa tabela vazia", () => {
  const f = lerPaginacao({ pagina: "999" }, 47);
  assert.equal(f.pagina, 5);
  assert.equal(fatiar(lista, f).length, 7);

  const zero = lerPaginacao({ pagina: "0" }, 47);
  assert.equal(zero.pagina, 1);

  const texto = lerPaginacao({ pagina: "abc" }, 47);
  assert.equal(texto.pagina, 1);
});

test("lista vazia continua a ter uma página", () => {
  const f = lerPaginacao({}, 0);
  assert.equal(f.totalPaginas, 1);
  assert.equal(f.pagina, 1);
  assert.deepEqual(fatiar([], f), []);
});

test("as páginas cobrem a lista toda, sem saltos nem repetições", () => {
  for (const porPagina of [10, 25, 50, 100]) {
    const vistos: number[] = [];
    const total = lerPaginacao({ porPagina: String(porPagina) }, lista.length).totalPaginas;

    for (let p = 1; p <= total; p++) {
      const f = lerPaginacao({ pagina: String(p), porPagina: String(porPagina) }, lista.length);
      vistos.push(...fatiar(lista, f));
    }

    assert.deepEqual(vistos, lista, `porPagina=${porPagina}`);
  }
});

test("os números visíveis não passam de uma mão-cheia de botões", () => {
  assert.deepEqual(numerosVisiveis(1, 5), [1, 2, 3, 4, 5]);

  const muitas = numerosVisiveis(10, 40);
  assert.ok(muitas.includes(1) && muitas.includes(40), "primeira e última sempre lá");
  assert.ok(muitas.includes(10), "a página actual sempre lá");
  assert.ok(muitas.length <= 9, `demasiados botões: ${muitas.length}`);
  assert.ok(muitas.includes("..."), "tem de haver reticências");
});
