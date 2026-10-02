import { test } from "node:test";
import assert from "node:assert/strict";

import { pontuarEntrevista, escalaoDaNota } from "../pontuacao.ts";
import { ROTEIRO, TOTAL_ROTEIRO, ESCALA, VERSAO_ROTEIRO } from "../roteiro.ts";
import { perguntaServe } from "../experiencia.ts";

/** As perguntas de um percurso: as comuns mais as do grupo. */
const percurso = (g: "com_experiencia" | "sem_experiencia") =>
  ROTEIRO.filter((p) => perguntaServe(p.grupo, g));

/**
 * Marca todas as perguntas de um percurso com a mesma resposta.
 *
 * O percurso de quem tem experiência serve de referência nestes testes: as
 * contas são as mesmas nos dois, e escolher um evita repetir tudo a dobrar.
 */
const COM = percurso("com_experiencia");

const todas = (m: "bom" | "razoavel" | "mau") =>
  Object.fromEntries(COM.map((p) => [p.codigo, m]));

const nota = (respostas: Record<string, string>) =>
  pontuarEntrevista(respostas as never, COM).nota;

test("cada percurso soma exactamente 100, e a lista toda soma mais", () => {
  // Desde que há perguntas próprias de cada grupo, ninguém responde à lista
  // inteira: o que tem de dar 100 é cada percurso.
  for (const g of ["com_experiencia", "sem_experiencia"] as const) {
    assert.equal(
      percurso(g).reduce((s, p) => s + p.peso, 0),
      100,
      `o percurso ${g} não soma 100`
    );
  }
  assert.ok(TOTAL_ROTEIRO > 100, "a lista toda tem de somar mais do que um percurso");
});

test("os dois percursos partilham perguntas, e têm as suas", () => {
  const com = new Set(percurso("com_experiencia").map((p) => p.codigo));
  const sem = new Set(percurso("sem_experiencia").map((p) => p.codigo));

  const comuns = [...com].filter((c) => sem.has(c));
  assert.ok(comuns.length >= 5, "poucas perguntas comuns: as notas deixam de ser comparáveis");
  assert.ok([...com].some((c) => !sem.has(c)), "quem tem experiência não tem perguntas próprias");
  assert.ok([...sem].some((c) => !com.has(c)), "quem não tem experiência não tem perguntas próprias");
});

test("os códigos das perguntas são únicos", () => {
  assert.equal(new Set(ROTEIRO.map((p) => p.codigo)).size, ROTEIRO.length);
});

test("tudo Bom dá 100, tudo Mau dá 0, tudo Razoável dá 50", () => {
  assert.equal(nota(todas("bom")), 100);
  assert.equal(nota(todas("mau")), 0);
  assert.equal(nota(todas("razoavel")), 50);
});

// ===========================================================================
// A NOTA SOMA PERGUNTA A PERGUNTA
// ---------------------------------------------------------------------------
// Regressão de um erro que chegou ao utilizador: bastava marcar a PRIMEIRA
// pergunta como Bom para o ecrã mostrar 100. A nota dividia-se pelo peso do
// que já tinha sido perguntado, por isso o primeiro Bom dava sempre o máximo
// e a nota DESCIA à medida que a entrevista avançava.
// ===========================================================================

test("marcar a primeira pergunta como Bom dá os pontos dela, não 100", () => {
  const primeira = COM[0];
  const r = pontuarEntrevista({ [primeira.codigo]: "bom" } as never, COM);

  assert.equal(r.nota, primeira.peso, "a nota tem de ser o peso daquela pergunta");
  assert.ok(r.nota < 100, "uma pergunta marcada não pode valer a entrevista toda");
  assert.equal(r.respondidas, 1);
  assert.equal(r.incompleta, true);
});

test("a nota sobe pergunta a pergunta, pelo peso de cada uma", () => {
  const respostas: Record<string, string> = {};
  let acumulado = 0;

  for (const p of COM) {
    respostas[p.codigo] = "bom";
    acumulado += p.peso;
    assert.equal(
      pontuarEntrevista(respostas as never, COM).nota,
      acumulado,
      `depois de marcar ${p.codigo} a nota devia ser ${acumulado}`
    );
  }

  assert.equal(acumulado, 100, "no fim tem de dar exactamente 100");
});

test("Razoável vale metade dos pontos da pergunta, Mau vale zero", () => {
  const p = COM[0];
  assert.equal(pontuarEntrevista({ [p.codigo]: "razoavel" } as never, COM).nota, Math.round(p.peso / 2));
  assert.equal(pontuarEntrevista({ [p.codigo]: "mau" } as never, COM).nota, 0);
});

test("uma pergunta por marcar não conta como Mau, mas também não dá pontos", () => {
  // A diferença entre não saber e saber que foi mau: nos dois casos a
  // pergunta não soma pontos, mas só um deles é uma avaliação completa.
  const ultima = COM[COM.length - 1];

  const semUma = { ...todas("bom") };
  delete (semUma as Record<string, unknown>)[ultima.codigo];
  const porMarcar = pontuarEntrevista(semUma as never, COM);

  const comMau = { ...todas("bom"), [ultima.codigo]: "mau" };
  const marcadaMau = pontuarEntrevista(comMau as never, COM);

  assert.equal(porMarcar.nota, 100 - ultima.peso);
  assert.equal(marcadaMau.nota, 100 - ultima.peso);
  assert.equal(porMarcar.incompleta, true, "por marcar é incompleta");
  assert.equal(marcadaMau.incompleta, false, "marcada como Mau é completa");
  assert.equal(porMarcar.pesoRespondido, 100 - ultima.peso);
  assert.equal(marcadaMau.pesoRespondido, 100);
});

test("a nota nunca passa de 100 nem desce abaixo de 0", () => {
  assert.equal(pontuarEntrevista(todas("bom") as never, COM).nota, 100);
  assert.equal(pontuarEntrevista(todas("mau") as never, COM).nota, 0);
});

test("o peso de cada pergunta pesa mesmo", () => {
  // Falhar a pergunta mais pesada do percurso tem de custar mais do que
  // falhar a mais leve, e cada uma tem de custar exactamente o seu peso.
  const ordenadas = [...COM].sort((a, b) => a.peso - b.peso);
  const leve = ordenadas[0];
  const pesada = ordenadas[ordenadas.length - 1];
  assert.ok(pesada.peso > leve.peso, "o roteiro tem de ter perguntas de pesos diferentes");

  assert.equal(nota({ ...todas("bom"), [leve.codigo]: "mau" }), 100 - leve.peso);
  assert.equal(nota({ ...todas("bom"), [pesada.codigo]: "mau" }), 100 - pesada.peso);
});

test("uma entrevista sem nada marcado dá zero e não rebenta", () => {
  const r = pontuarEntrevista({}, COM);
  assert.equal(r.nota, 0);
  assert.equal(r.respondidas, 0);
  assert.equal(r.pesoRespondido, 0);
});

test("códigos desconhecidos são ignorados em silêncio", () => {
  // A leitura da ficha em papel pode inventar um código; não pode contaminar.
  const r = pontuarEntrevista({ ...todas("bom"), XX: "mau" } as never, COM);
  assert.equal(r.nota, 100);
  assert.equal(r.detalhe.length, COM.length);
});

test("o resultado traz a versão do roteiro, para a avaliação ser reproduzível", () => {
  assert.equal(pontuarEntrevista(todas("bom")).versao, VERSAO_ROTEIRO);
});

test("os escalões cobrem a escala toda", () => {
  assert.equal(escalaoDaNota(100).rotulo, "Muito bom");
  assert.equal(escalaoDaNota(80).rotulo, "Muito bom");
  assert.equal(escalaoDaNota(79).rotulo, "Bom");
  assert.equal(escalaoDaNota(60).rotulo, "Bom");
  assert.equal(escalaoDaNota(40).rotulo, "Razoável");
  assert.equal(escalaoDaNota(0).rotulo, "Fraco");
});

test("a fracção de cada marcação é a esperada", () => {
  assert.equal(ESCALA.bom.fraccao, 1);
  assert.equal(ESCALA.razoavel.fraccao, 0.5);
  assert.equal(ESCALA.mau.fraccao, 0);
});
