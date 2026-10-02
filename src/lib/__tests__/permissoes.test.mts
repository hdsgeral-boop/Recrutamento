import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFINICOES, PAPEIS, papelValido, pode, type Capacidade } from "../permissoes.ts";
import { DEFINICOES_FASE, FASES, faseValida } from "../constantes-fases.ts";

const TODAS: Capacidade[] = [
  "ver",
  "exportar",
  "editar_candidatura",
  "analisar",
  "enviar_email",
  "marcar_evento",
  "gerir_utilizadores",
];

test("o administrador pode tudo", () => {
  for (const c of TODAS) assert.equal(pode("admin", c), true, c);
});

test("só o administrador gere contas", () => {
  for (const p of PAPEIS) {
    assert.equal(pode(p, "gerir_utilizadores"), p === "admin", p);
  }
});

test("o visualizador só vê", () => {
  assert.equal(pode("visualizador", "ver"), true);
  for (const c of TODAS.filter((x) => x !== "ver")) {
    assert.equal(pode("visualizador", c), false, c);
  }
});

test("o editor mexe nas candidaturas mas não comunica nem marca", () => {
  assert.equal(pode("editor", "editar_candidatura"), true);
  assert.equal(pode("editor", "analisar"), true);
  assert.equal(pode("editor", "exportar"), true);
  assert.equal(pode("editor", "enviar_email"), false);
  assert.equal(pode("editor", "marcar_evento"), false);
});

test("o gestor conduz o recrutamento mas não toca nas contas", () => {
  assert.equal(pode("gestor", "enviar_email"), true);
  assert.equal(pode("gestor", "marcar_evento"), true);
  assert.equal(pode("gestor", "exportar"), true);
  assert.equal(pode("gestor", "gerir_utilizadores"), false);
});

test("todos os papéis vêem o painel, senão não valia a pena terem conta", () => {
  for (const p of PAPEIS) assert.equal(pode(p, "ver"), true, p);
});

test("as capacidades encolhem à medida que se desce nos papéis", () => {
  const conta = (p: (typeof PAPEIS)[number]) => DEFINICOES[p].capacidades.length;
  assert.ok(conta("admin") > conta("gestor"));
  assert.ok(conta("gestor") > conta("editor"));
  assert.ok(conta("editor") > conta("visualizador"));
});

test("um papel inventado cai no menos permissivo", () => {
  for (const mau of ["deus", "", null, undefined, 42, "ADMIN"]) {
    assert.equal(papelValido(mau), "visualizador", String(mau));
  }
  assert.equal(papelValido("admin"), "admin");
});

test("sem papel nenhum não se pode nada, nem ver", () => {
  assert.equal(pode(null, "ver"), false);
  assert.equal(pode(undefined, "gerir_utilizadores"), false);
});

// ------------------------------------------------------------------- FASES

test("as quatro fases têm texto completo", () => {
  for (const f of FASES) {
    const d = DEFINICOES_FASE[f];
    assert.ok(d.rotulo.length > 2, f);
    assert.ok(d.assunto.length > 5, f);
    assert.ok(d.abertura.length > 20, f);
    assert.ok(d.notas.length > 20, f);
    assert.match(d.cor, /^#[0-9a-f]{6}$/i, f);
  }
});

test("só a entrevista muda o estado do candidato", () => {
  assert.equal(DEFINICOES_FASE.entrevista.estadoSugerido, "Contactado");
  for (const f of FASES.filter((x) => x !== "entrevista")) {
    assert.equal(DEFINICOES_FASE[f].estadoSugerido, null, f);
  }
});

test("faseValida recusa o que não é fase", () => {
  assert.equal(faseValida("entrevista"), true);
  assert.equal(faseValida("almoco"), false);
  assert.equal(faseValida(null), false);
});

// -------------------------------------------- PALAVRAS-PASSE GERADAS

test("a palavra-passe gerada passa sempre nas regras mínimas", async () => {
  const { gerarPalavraPasse, palavraPasseFraca } = await import("../auth.ts");

  const vistas = new Set<string>();

  for (let i = 0; i < 300; i++) {
    const p = gerarPalavraPasse();
    assert.equal(palavraPasseFraca(p), null, `falhou nas regras: ${p}`);
    assert.equal(p.length, 14);
    vistas.add(p);
  }

  // 300 gerações não podem repetir-se: se repetissem, a aleatoriedade estaria
  // partida e duas contas ficariam com a mesma palavra-passe.
  assert.equal(vistas.size, 300, "houve palavras-passe repetidas");
});

test("a palavra-passe não usa caracteres que se confundem ao telefone", async () => {
  const { gerarPalavraPasse } = await import("../auth.ts");

  for (let i = 0; i < 200; i++) {
    const p = gerarPalavraPasse();
    assert.ok(!/[lI1O0]/.test(p), `tem caracteres ambíguos: ${p}`);
  }
});

test("o primeiro carácter não é sempre do mesmo tipo", async () => {
  const { gerarPalavraPasse } = await import("../auth.ts");

  const tipos = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const c = gerarPalavraPasse()[0];
    tipos.add(/[a-z]/.test(c) ? "min" : /[A-Z]/.test(c) ? "mai" : "num");
  }

  assert.ok(tipos.size >= 2, "o baralhamento não está a funcionar");
});
