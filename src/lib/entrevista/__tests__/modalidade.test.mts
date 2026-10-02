import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  DEFINICOES_MODALIDADE,
  MAXIMO_TENTATIVAS,
  modalidadeValida,
  podeRemarcar,
  podeTentarChamada,
  RESULTADOS_CHAMADA,
  resultadoValido,
  rotuloDoResultado,
  situacaoDaChamada,
  validarLinkVideochamada,
} from "@/lib/entrevista/modalidade";

/* ═════════════════════════════ AS DUAS FORMAS ══════════════════════════ */

test("só existem duas modalidades, e nada mais passa", () => {
  assert.equal(modalidadeValida("videochamada"), true);
  assert.equal(modalidadeValida("chamada"), true);
  assert.equal(modalidadeValida("presencial"), false);
  assert.equal(modalidadeValida(""), false);
  assert.equal(modalidadeValida(null), false);
  assert.equal(modalidadeValida(undefined), false);
});

test("a explicação da chamada diz ao candidato as três tentativas e o que acontece", () => {
  const t = DEFINICOES_MODALIDADE.chamada.explicacao;
  assert.match(t, new RegExp(String(MAXIMO_TENTATIVAS)));
  assert.match(t, /não volta a ser marcada/i);
});

test("a explicação da videochamada diz que é Meet e que se remarca", () => {
  const t = DEFINICOES_MODALIDADE.videochamada.explicacao;
  assert.match(t, /Google Meet/i);
  assert.match(t, /remarcamos/i);
});

/* ═══════════════════════════ SITUAÇÃO DA CHAMADA ═══════════════════════ */

test("quem não escolheu chamada não tem situação de chamada nenhuma", () => {
  assert.equal(situacaoDaChamada("videochamada", 0).estado, "nao_aplica");
  assert.equal(situacaoDaChamada(null, 2).estado, "nao_aplica");
});

test("a contagem anda de por ligar até esgotado", () => {
  assert.equal(situacaoDaChamada("chamada", 0).estado, "por_ligar");
  assert.equal(situacaoDaChamada("chamada", 1).estado, "a_tentar");
  assert.equal(situacaoDaChamada("chamada", 2).estado, "a_tentar");
  assert.equal(situacaoDaChamada("chamada", 3).estado, "esgotado");
});

test("as restantes nunca ficam negativas, mesmo com uma contagem estragada", () => {
  assert.equal(situacaoDaChamada("chamada", 9).restantes, 0);
  assert.equal(situacaoDaChamada("chamada", 9).estado, "esgotado");
  assert.equal(situacaoDaChamada("chamada", -4).estado, "por_ligar");
  assert.equal(situacaoDaChamada("chamada", Number.NaN).tentativas, 0);
});

test("o texto diz quantas faltam, para ninguém ter de contar", () => {
  assert.match(situacaoDaChamada("chamada", 1).texto, /Faltam 2/);
  assert.match(situacaoDaChamada("chamada", 2).texto, /Faltam 1/);
  assert.match(situacaoDaChamada("chamada", 3).texto, /sem atender/i);
});

test("quem atendeu fica marcado como tendo atendido, e diz-se à quantas", () => {
  assert.equal(situacaoDaChamada("chamada", 1, true).estado, "atendeu");
  assert.match(situacaoDaChamada("chamada", 1, true).texto, /à primeira/i);
  assert.match(situacaoDaChamada("chamada", 2, true).texto, /2\.ª/);
});

/* ════════════════════════════ PODE REMARCAR? ═══════════════════════════ */

test("a videochamada remarca-se sempre - a rede não é culpa do candidato", () => {
  assert.equal(podeRemarcar("videochamada", 0).ok, true);
  assert.equal(podeRemarcar("videochamada", 99).ok, true);
});

test("sem modalidade escolhida, remarca-se como sempre se remarcou", () => {
  // É o caso de todas as entrevistas marcadas antes desta funcionalidade.
  assert.equal(podeRemarcar(null, 0).ok, true);
  assert.equal(podeRemarcar(undefined, 5).ok, true);
});

test("a chamada remarca-se enquanto houver tentativas", () => {
  assert.equal(podeRemarcar("chamada", 0).ok, true);
  assert.equal(podeRemarcar("chamada", 1).ok, true);
  assert.equal(podeRemarcar("chamada", 2).ok, true);
});

test("gastas as três tentativas sem atender, NÃO se remarca", () => {
  const r = podeRemarcar("chamada", 3);
  assert.equal(r.ok, false);
  assert.match(r.erro!, /3 tentativas/);
  assert.match(r.erro!, /não tem remarcação/i);
});

test("mas se atendeu, mesmo à terceira, não fica travado", () => {
  assert.equal(podeRemarcar("chamada", 3, true).ok, true);
});

/* ═══════════════════════════ PODE TENTAR MAIS? ═════════════════════════ */

test("só se liga a quem escolheu chamada", () => {
  assert.equal(podeTentarChamada("videochamada", 0).ok, false);
  assert.equal(podeTentarChamada(null, 0).ok, false);
});

test("liga-se até à terceira, e nunca a uma quarta", () => {
  assert.equal(podeTentarChamada("chamada", 0).ok, true);
  assert.equal(podeTentarChamada("chamada", 2).ok, true);
  assert.equal(podeTentarChamada("chamada", 3).ok, false);
  assert.match(podeTentarChamada("chamada", 3).erro!, /já foram feitas/i);
});

test("a quem já atendeu não se liga outra vez", () => {
  const r = podeTentarChamada("chamada", 1, true);
  assert.equal(r.ok, false);
  assert.match(r.erro!, /já atendeu/i);
});

/* ═════════════════════════ LINK DA VIDEOCHAMADA ════════════════════════ */

test("aceita um link do Meet", () => {
  assert.equal(validarLinkVideochamada("https://meet.google.com/abc-defg-hij").ok, true);
  assert.equal(validarLinkVideochamada("  https://meet.google.com/abc-defg-hij  ").ok, true);
});

test("aceita um link de marcação do Google Calendar", () => {
  assert.equal(validarLinkVideochamada("https://calendar.app.google/xyz123").ok, true);
});

test("recusa um link de outro sítio qualquer", () => {
  assert.equal(validarLinkVideochamada("https://zoom.us/j/123").ok, false);
  assert.match(validarLinkVideochamada("https://zoom.us/j/123").erro!, /Google Meet/);
  assert.equal(validarLinkVideochamada("https://meet.google.com.falso.ao/x").ok, false);
});

test("recusa http, que num email é um convite a problemas", () => {
  assert.equal(validarLinkVideochamada("http://meet.google.com/abc-defg-hij").ok, false);
});

test("recusa o que nem sequer é um endereço", () => {
  assert.equal(validarLinkVideochamada("abc-defg-hij").ok, false);
  assert.equal(validarLinkVideochamada("").ok, false);
  assert.equal(validarLinkVideochamada("   ").ok, false);
});

test("recusa um link do Meet cortado a meio", () => {
  const r = validarLinkVideochamada("https://meet.google.com/abc");
  assert.equal(r.ok, false);
  assert.match(r.erro!, /incompleto/i);
});

/* ══════════════════════ O QUE ACONTECEU NA CHAMADA ═════════════════════ */

test("os cinco desfechos possíveis, e nada mais", () => {
  assert.deepEqual(
    RESULTADOS_CHAMADA.map((r) => r.chave),
    ["atendeu", "nao_atendeu", "desligado", "numero_errado", "pediu_para_ligar_depois"]
  );
  assert.equal(resultadoValido("atendeu"), true);
  assert.equal(resultadoValido("ninguem_sabe"), false);
  assert.equal(resultadoValido(null), false);
});

test("só «atendeu» fecha a chamada", () => {
  const fecham = RESULTADOS_CHAMADA.filter((r) => r.fecha).map((r) => r.chave);
  assert.deepEqual(fecham, ["atendeu"]);
});

test("«pediu para ligar depois» gasta uma tentativa na mesma", () => {
  // A chamada foi feita e o tempo da equipa foi gasto. O que muda é saber-se
  // que vale a pena usar a seguinte.
  const r = RESULTADOS_CHAMADA.find((x) => x.chave === "pediu_para_ligar_depois")!;
  assert.equal(r.fecha, false);
});

test("o rótulo traduz, e o que não conhece devolve tal e qual", () => {
  assert.equal(rotuloDoResultado("nao_atendeu"), "Não atendeu");
  assert.equal(rotuloDoResultado("outra_coisa"), "outra_coisa");
});
