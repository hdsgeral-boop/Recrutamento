import { test } from "node:test";
import assert from "node:assert/strict";

import {
  escaparHtml,
  interpolarTexto,
  interpolarHtml,
} from "../interpolacao.ts";

test("escaparHtml: protege contra caracteres perigosos", () => {
  assert.equal(escaparHtml("João & Maria <script>"), "João &amp; Maria &lt;script&gt;");
  assert.equal(escaparHtml('Ele disse: "Olá"'), "Ele disse: &quot;Olá&quot;");
  assert.equal(escaparHtml("D'Água"), "D&#39;Água");
  assert.equal(escaparHtml(null), "");
  assert.equal(escaparHtml(undefined), "");
});

test("interpolarTexto: substitui variáveis no assunto e no corpo simples", () => {
  const tpl = "Olá {{nome}}, a tua candidatura para {{ vaga }} foi recebida com a referência {{referencia}}.";
  const res = interpolarTexto(tpl, {
    nome: "Manuel Costa",
    vaga: "Técnico de Cadastro",
    referencia: "BENGO-001",
  });
  assert.equal(
    res,
    "Olá Manuel Costa, a tua candidatura para Técnico de Cadastro foi recebida com a referência BENGO-001."
  );
});

test("interpolarTexto: variáveis ausentes viram string vazia sem rebentar", () => {
  const tpl = "Candidato: {{nome}}, Telefone: {{telefone}}";
  const res = interpolarTexto(tpl, { nome: "António" });
  assert.equal(res, "Candidato: António, Telefone: ");
});

test("interpolarHtml: escapa valores interpolados para evitar XSS", () => {
  const tpl = "<p>Olá <strong>{{nome}}</strong>, nota: {{nota}}</p>";
  const res = interpolarHtml(tpl, {
    nome: "Carlos <script>alert(1)</script>",
    nota: "18 & 19",
  });
  assert.equal(
    res,
    "<p>Olá <strong>Carlos &lt;script&gt;alert(1)&lt;/script&gt;</strong>, nota: 18 &amp; 19</p>"
  );
});

test("interpolarHtml: suporta números e valores booleanos", () => {
  const tpl = "<span>Vagas: {{vagas}}, Activo: {{activo}}</span>";
  const res = interpolarHtml(tpl, { vagas: 58, activo: true });
  assert.equal(res, "<span>Vagas: 58, Activo: true</span>");
});
