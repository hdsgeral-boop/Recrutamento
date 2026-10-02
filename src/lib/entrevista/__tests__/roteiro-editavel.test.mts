import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ROTEIRO_SEMENTE,
  PESO_TOTAL_EXIGIDO,
  normalizarRoteiro,
  validarRoteiro,
  versaoSeguinte,
  type Pergunta,
} from "@/lib/entrevista/roteiro";
import { pontuarEntrevista } from "@/lib/entrevista/pontuacao";
import { perguntaServe } from "@/lib/entrevista/experiencia";

/** Um roteiro pequeno, para as contas serem verificáveis de cabeça. */
const DOIS: Pergunta[] = [
  { codigo: "T1", bloco: "tecnica", pergunta: "Primeira?", procurar: "", peso: 60 },
  { codigo: "C1", bloco: "comportamental", pergunta: "Segunda?", procurar: "", peso: 40 },
];

// ---------------------------------------------------------------- VALIDAÇÃO

test("a semente do código é um roteiro válido", () => {
  assert.deepEqual(validarRoteiro(ROTEIRO_SEMENTE), []);
});

test("pesos que não somam 100 são recusados, e o erro diz a soma", () => {
  const erros = validarRoteiro([{ ...DOIS[0], peso: 50 }, DOIS[1]]);
  // Perguntas sem grupo valem para os dois percursos: os dois falham.
  assert.equal(erros.length, 2);
  assert.ok(erros.every((e) => /soma 90 pontos/.test(e)));
  assert.ok(erros.some((e) => /com experiência/.test(e)));
  assert.ok(erros.some((e) => /sem experiência/.test(e)));
});

// ------------------------------------------------- PERGUNTAS POR PERCURSO

test("cada percurso soma 100 por si, e não a lista toda", () => {
  // 60 comuns + 40 para quem tem experiência + 40 para quem não tem.
  // A lista soma 140, mas cada percurso soma 100. Tem de passar.
  const roteiro: Pergunta[] = [
    { codigo: "G1", bloco: "tecnica", pergunta: "Comum?", procurar: "", peso: 60, grupo: "ambos" },
    { codigo: "E1", bloco: "tecnica", pergunta: "Só experientes?", procurar: "", peso: 40, grupo: "com_experiencia" },
    { codigo: "N1", bloco: "tecnica", pergunta: "Só novatos?", procurar: "", peso: 40, grupo: "sem_experiencia" },
  ];
  assert.deepEqual(validarRoteiro(roteiro), []);
  assert.equal(roteiro.reduce((s, p) => s + p.peso, 0), 140);
});

test("um percurso desequilibrado é apanhado, e só esse", () => {
  const roteiro: Pergunta[] = [
    { codigo: "G1", bloco: "tecnica", pergunta: "Comum?", procurar: "", peso: 60, grupo: "ambos" },
    { codigo: "E1", bloco: "tecnica", pergunta: "Só experientes?", procurar: "", peso: 40, grupo: "com_experiencia" },
    { codigo: "N1", bloco: "tecnica", pergunta: "Só novatos?", procurar: "", peso: 25, grupo: "sem_experiencia" },
  ];
  const erros = validarRoteiro(roteiro);
  assert.equal(erros.length, 1);
  assert.match(erros[0], /sem experiência soma 85/);
});

test("uma pergunta sem grupo conta para os dois percursos", () => {
  assert.equal(perguntaServe(undefined, "com_experiencia"), true);
  assert.equal(perguntaServe(undefined, "sem_experiencia"), true);
  assert.equal(perguntaServe("ambos", "com_experiencia"), true);
});

test("uma pergunta de um grupo não serve o outro", () => {
  assert.equal(perguntaServe("com_experiencia", "com_experiencia"), true);
  assert.equal(perguntaServe("com_experiencia", "sem_experiencia"), false);
  assert.equal(perguntaServe("sem_experiencia", "com_experiencia"), false);
});

test("com o grupo por decidir, só passam as perguntas comuns", () => {
  // Fazer as perguntas de um grupo a quem ainda não foi classificado seria
  // escolher por ele, e depois comparar a nota com quem respondeu ao outro.
  assert.equal(perguntaServe("ambos", "indeterminado"), true);
  assert.equal(perguntaServe("com_experiencia", "indeterminado"), false);
  assert.equal(perguntaServe("sem_experiencia", "indeterminado"), false);
});

test("um código repetido é recusado", () => {
  const erros = validarRoteiro([DOIS[0], { ...DOIS[1], codigo: "T1" }]);
  assert.ok(erros.some((e) => /T1 aparece duas vezes/.test(e)));
});

test("um código com formato estranho é recusado", () => {
  const erros = validarRoteiro([{ ...DOIS[0], codigo: "pergunta longa" }, DOIS[1]]);
  assert.ok(erros.some((e) => /não serve/.test(e)));
});

test("uma pergunta sem texto é recusada", () => {
  const erros = validarRoteiro([{ ...DOIS[0], pergunta: "   " }, DOIS[1]]);
  assert.ok(erros.some((e) => /sem texto/.test(e)));
});

test("peso zero ou negativo é recusado", () => {
  assert.ok(validarRoteiro([{ ...DOIS[0], peso: 0 }, { ...DOIS[1], peso: 100 }]).length > 0);
  assert.ok(validarRoteiro([{ ...DOIS[0], peso: -10 }, { ...DOIS[1], peso: 110 }]).length > 0);
});

test("um roteiro vazio é recusado, e não rebenta", () => {
  assert.deepEqual(validarRoteiro([]), ["O roteiro tem de ter pelo menos uma pergunta."]);
});

test("o total exigido é 100", () => {
  assert.equal(PESO_TOTAL_EXIGIDO, 100);
});

// ------------------------------------------------------------------ VERSÕES

test("a versão seguinte incrementa o número, e passa a dezena", () => {
  assert.equal(versaoSeguinte("ugp-e1"), "ugp-e2");
  assert.equal(versaoSeguinte("ugp-e9"), "ugp-e10");
  assert.equal(versaoSeguinte("ugp-e19"), "ugp-e20");
});

test("uma versão sem número no fim ganha sufixo em vez de rebentar", () => {
  assert.equal(versaoSeguinte("roteiro"), "roteiro-2");
  assert.equal(versaoSeguinte(""), "roteiro-2");
});

// --------------------------------------------------------------- PONTUAÇÃO

test("a pontuação usa o roteiro que lhe é dado, não o do código", () => {
  const r = pontuarEntrevista({ T1: "bom", C1: "mau" }, DOIS, "teste-1");
  assert.equal(r.nota, 60); // 60 de 100 perguntados
  assert.equal(r.totalPerguntas, 2);
  assert.equal(r.versao, "teste-1");
});

test("mudar o peso muda a nota da mesma entrevista - é por isso que há versões", () => {
  const respostas = { T1: "bom", C1: "mau" } as const;

  const antes = pontuarEntrevista(respostas, DOIS, "v1");
  const depois = pontuarEntrevista(
    respostas,
    [{ ...DOIS[0], peso: 30 }, { ...DOIS[1], peso: 70 }],
    "v2"
  );

  assert.equal(antes.nota, 60);
  assert.equal(depois.nota, 30);
  assert.notEqual(antes.nota, depois.nota);
});

test("uma marcação de pergunta que não existe no roteiro não conta", () => {
  const r = pontuarEntrevista({ T1: "bom", XX: "bom" } as never, DOIS, "v1");
  assert.equal(r.respondidas, 1);
  assert.equal(r.pesoRespondido, 60);
  // 60 pontos ganhos num roteiro que vale 100. O XX não acrescenta nada.
  assert.equal(r.nota, 60);
  assert.equal(r.incompleta, true);
});

test("sem nenhuma marcação a nota é zero e não é NaN", () => {
  const r = pontuarEntrevista({}, DOIS, "v1");
  assert.equal(r.nota, 0);
  assert.equal(r.respondidas, 0);
  assert.equal(Number.isNaN(r.nota), false);
});

test("razoável vale exactamente metade do peso", () => {
  const r = pontuarEntrevista({ T1: "razoavel", C1: "razoavel" }, DOIS, "v1");
  assert.equal(r.pontosObtidos, 50);
  assert.equal(r.nota, 50);
});

test("marcar TODAS as perguntas do roteiro em vigor não fica incompleta", () => {
  // O erro que isto apanha: comparar com o roteiro do código (10 perguntas)
  // em vez do roteiro em vigor (2) marcava como incompleta uma entrevista
  // que foi feita até ao fim, e gravava-a assim.
  const r = pontuarEntrevista({ T1: "bom", C1: "razoavel" }, DOIS, "v1");
  assert.equal(r.respondidas, 2);
  assert.equal(r.totalPerguntas, 2);
  assert.equal(r.incompleta, false);
});

test("com uma pergunta por marcar, fica incompleta", () => {
  const r = pontuarEntrevista({ T1: "bom" }, DOIS, "v1");
  assert.equal(r.incompleta, true);
});

// ===========================================================================
// A LIMPEZA NÃO PODE PERDER CAMPOS
// ---------------------------------------------------------------------------
// Regressão de um erro que chegou ao utilizador no projecto UGP e que este
// código também tinha: o ecrã mostrava os dois percursos a 100/100, e a
// gravação recusava a dizer que somavam 120. A limpeza do servidor
// reconstruía cada pergunta campo a campo e deixava o `grupo` de fora - e
// sem grupo todas as perguntas contam para os dois percursos.
// ===========================================================================

const COM_GRUPOS: Pergunta[] = [
  { codigo: "T1", bloco: "tecnica", grupo: "ambos", pergunta: "Comum A", procurar: "", peso: 40 },
  { codigo: "T2", bloco: "tecnica", grupo: "ambos", pergunta: "Comum B", procurar: "", peso: 40 },
  { codigo: "E1", bloco: "tecnica", grupo: "com_experiencia", pergunta: "Só quem fez", procurar: "", peso: 20 },
  { codigo: "N1", bloco: "comportamental", grupo: "sem_experiencia", pergunta: "Só quem não fez", procurar: "", peso: 20 },
];

test("limpar não deita fora o grupo: o que o ecrã aceita a gravação aceita", () => {
  assert.deepEqual(validarRoteiro(COM_GRUPOS), []);
  assert.deepEqual(validarRoteiro(normalizarRoteiro(COM_GRUPOS)), []);
});

test("as perguntas de percurso continuam no percurso delas depois de limpas", () => {
  const limpas = normalizarRoteiro(COM_GRUPOS);
  assert.equal(limpas.find((p) => p.codigo === "E1")?.grupo, "com_experiencia");
  assert.equal(limpas.find((p) => p.codigo === "N1")?.grupo, "sem_experiencia");
});

test("limpar arruma espaços, minúsculas e pesos que vieram como texto", () => {
  const sujas = [
    { codigo: " t1 ", bloco: "tecnica", pergunta: "  Com espaços  ", procurar: " x ", peso: "60" },
    { codigo: "c1", bloco: "comportamental", pergunta: "Outra", procurar: "", peso: 40 },
  ] as unknown as Pergunta[];

  const limpas = normalizarRoteiro(sujas);
  assert.equal(limpas[0].codigo, "T1");
  assert.equal(limpas[0].pergunta, "Com espaços");
  assert.equal(limpas[0].peso, 60);
  assert.equal(limpas[1].codigo, "C1");
  assert.deepEqual(validarRoteiro(limpas), []);
});

test("limpar é idempotente: limpar duas vezes dá o mesmo", () => {
  const uma = normalizarRoteiro(COM_GRUPOS);
  assert.deepEqual(normalizarRoteiro(uma), uma);
});
