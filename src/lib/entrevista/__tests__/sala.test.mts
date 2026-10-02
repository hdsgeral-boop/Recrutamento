import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  aindaAPreparar,
  explicarErro,
  falhouAPreparar,
  fimDaEntrevista,
  idDoPedido,
  lerSala,
  montarEvento,
} from "@/lib/entrevista/sala";

const PEDIDO = {
  nome: "João Manuel",
  email: "joao@exemplo.ao",
  inicio: "2026-10-05T09:00:00+01:00",
  duracaoMinutos: 30,
  referencia: "BNG-0042",
};

/* ═══════════════════════════ FIM DA ENTREVISTA ═════════════════════════ */

test("o fim é o início mais a duração", () => {
  assert.equal(fimDaEntrevista("2026-10-05T09:00:00+01:00", 30), "2026-10-05T08:30:00.000Z");
});

test("uma duração absurda não vira um evento absurdo", () => {
  // 9h + 240min = 13h (08:00Z + 4h = 12:00Z)
  assert.equal(fimDaEntrevista("2026-10-05T09:00:00+01:00", 9999), "2026-10-05T12:00:00.000Z");
  // menos de 5 minutos sobe para 5
  assert.equal(fimDaEntrevista("2026-10-05T09:00:00+01:00", 1), "2026-10-05T08:05:00.000Z");
});

test("sem duração credível assume meia hora", () => {
  assert.equal(fimDaEntrevista("2026-10-05T09:00:00+01:00", Number.NaN), "2026-10-05T08:30:00.000Z");
});

test("uma data que não é data não produz fim nenhum", () => {
  assert.equal(fimDaEntrevista("amanhã", 30), null);
});

/* ═════════════════════════ IDENTIFICADOR DO PEDIDO ═════════════════════ */

test("o mesmo candidato à mesma hora dá sempre o mesmo pedido", () => {
  // É o que impede o Google de criar duas salas quando a rede repete o envio.
  const a = idDoPedido("abc-123", "2026-10-05T09:00:00+01:00");
  const b = idDoPedido("abc-123", "2026-10-05T09:00:00+01:00");
  assert.equal(a, b);
});

test("horas diferentes dão pedidos diferentes", () => {
  assert.notEqual(
    idDoPedido("abc-123", "2026-10-05T09:00:00+01:00"),
    idDoPedido("abc-123", "2026-10-05T10:00:00+01:00")
  );
});

test("candidatos diferentes dão pedidos diferentes", () => {
  assert.notEqual(
    idDoPedido("abc-123", "2026-10-05T09:00:00+01:00"),
    idDoPedido("xyz-999", "2026-10-05T09:00:00+01:00")
  );
});

test("o identificador só leva caracteres que o Google aceita", () => {
  const id = idDoPedido("abc/123 çãõ", "2026-10-05T09:00:00+01:00");
  assert.match(id, /^[a-zA-Z0-9-]+$/);
  assert.ok(id.length <= 64);
});

/* ═══════════════════════════ MONTAR O EVENTO ═══════════════════════════ */

test("o evento leva o nome, o convidado, o fuso e o pedido de Meet", () => {
  const e = montarEvento(PEDIDO, "abc-123", "Consulvolt")!;
  assert.match(e.summary, /João Manuel/);
  assert.deepEqual(e.attendees, [{ email: "joao@exemplo.ao" }]);
  assert.equal(e.start.timeZone, "Africa/Luanda");
  assert.equal(e.end.timeZone, "Africa/Luanda");
  assert.equal(e.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
});

test("a descrição avisa quem lá for que não apague o evento", () => {
  const e = montarEvento(PEDIDO, "abc-123", "Consulvolt")!;
  assert.match(e.description, /não apagues/i);
  assert.match(e.description, /BNG-0042/);
});

test("uma data impossível não monta evento nenhum", () => {
  assert.equal(montarEvento({ ...PEDIDO, inicio: "lixo" }, "abc-123", "Consulvolt"), null);
});

/* ════════════════════════ LER O LINK DA RESPOSTA ═══════════════════════ */

test("lê o link do hangoutLink, que é o caminho normal", () => {
  const s = lerSala({ id: "ev1", hangoutLink: "https://meet.google.com/abc-defg-hij" });
  assert.equal(s?.link, "https://meet.google.com/abc-defg-hij");
  assert.equal(s?.eventoId, "ev1");
});

test("quando o hangoutLink não vem, lê o entryPoint de vídeo", () => {
  const s = lerSala({
    id: "ev2",
    conferenceData: {
      entryPoints: [
        { entryPointType: "phone", uri: "tel:+351-123-456" },
        { entryPointType: "video", uri: "https://meet.google.com/xyz-abcd-efg" },
      ],
    },
  });
  assert.equal(s?.link, "https://meet.google.com/xyz-abcd-efg");
});

test("NUNCA devolve um número de telefone como se fosse uma sala", () => {
  const s = lerSala({
    id: "ev3",
    conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:+351-123-456" }] },
  });
  assert.equal(s, null);
});

test("recusa um link que não seja do Meet", () => {
  assert.equal(lerSala({ hangoutLink: "https://zoom.us/j/1" }), null);
  assert.equal(lerSala({ hangoutLink: "http://meet.google.com/abc-defg-hij" }), null);
});

test("uma resposta vazia ou estragada devolve nada, sem rebentar", () => {
  assert.equal(lerSala(null), null);
  assert.equal(lerSala(undefined), null);
  assert.equal(lerSala({}), null);
  assert.equal(lerSala({ hangoutLink: "" }), null);
  assert.equal(lerSala({ conferenceData: { entryPoints: null } }), null);
});

/* ════════════════════════════ EXPLICAR O ERRO ══════════════════════════ */

test("o âmbito em falta diz onde está o passo a passo", () => {
  const t = explicarErro(new Error("Request had insufficient authentication scopes. 403"));
  assert.match(t, /calendar\.events/);
  assert.match(t, /GOOGLE-CALENDAR\.md/);
});

test("o token caducado diz qual é a variável a mudar", () => {
  assert.match(explicarErro(new Error("invalid_grant")), /GOOGLE_OAUTH_REFRESH_TOKEN/);
});

test("a API desligada diz para a activar", () => {
  const t = explicarErro(new Error("Google Calendar API has not been used in project 123 before"));
  assert.match(t, /activa/i);
});

test("a conta de serviço diz porque é que não dá", () => {
  const t = explicarErro(new Error("Invalid conference type value."));
  assert.match(t, /Contas de serviço/i);
});

test("um erro desconhecido não se perde - mostra-se tal e qual", () => {
  assert.match(explicarErro(new Error("alguma coisa nova")), /alguma coisa nova/);
});

test("sem email não se convida ninguém, em vez de convidar um vazio", () => {
  // Uma lista com um convidado de email vazio faz o Calendar recusar o evento
  // inteiro. É o caso do teste de ligação, que não convida ninguém.
  const e = montarEvento({ ...PEDIDO, email: "" }, "abc-123", "Consulvolt")!;
  assert.deepEqual(e.attendees, []);
  const f = montarEvento({ ...PEDIDO, email: "   " }, "abc-123", "Consulvolt")!;
  assert.deepEqual(f.attendees, []);
});

test("o email do convidado vai sem espaços à volta", () => {
  const e = montarEvento({ ...PEDIDO, email: "  joao@exemplo.ao " }, "abc-123", "Consulvolt")!;
  assert.deepEqual(e.attendees, [{ email: "joao@exemplo.ao" }]);
});

/* ═══════════════ A SALA PODE AINDA ESTAR A SER PREPARADA ═══════════════ */

test("reconhece que o Google ainda está a preparar a sala", () => {
  // A criação da conferência é assíncrona: a resposta ao insert pode vir sem
  // link nenhum. Assumir que vem sempre grava metade de um lote sem sala.
  const pendente = { id: "ev1", conferenceData: { createRequest: { status: { statusCode: "pending" } } } };
  assert.equal(aindaAPreparar(pendente), true);
  assert.equal(lerSala(pendente), null);
});

test("reconhece que o Google desistiu", () => {
  const falhou = { id: "ev1", conferenceData: { createRequest: { status: { statusCode: "failure" } } } };
  assert.equal(falhouAPreparar(falhou), true);
  assert.equal(aindaAPreparar(falhou), false);
});

test("uma sala já pronta não está nem pendente nem falhada", () => {
  const pronta = {
    id: "ev1",
    hangoutLink: "https://meet.google.com/abc-defg-hij",
    conferenceData: { createRequest: { status: { statusCode: "success" } } },
  };
  assert.equal(aindaAPreparar(pronta), false);
  assert.equal(falhouAPreparar(pronta), false);
  assert.equal(lerSala(pronta)?.link, "https://meet.google.com/abc-defg-hij");
});

test("uma resposta sem estado nenhum não se diz pendente", () => {
  // Senão esperava-se por uma sala que nunca vinha.
  assert.equal(aindaAPreparar({ id: "ev1" }), false);
  assert.equal(aindaAPreparar(null), false);
  assert.equal(falhouAPreparar(undefined), false);
});
