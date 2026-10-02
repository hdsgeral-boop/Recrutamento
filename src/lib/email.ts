import "server-only";
import nodemailer from "nodemailer";
import { EMPRESA } from "@/lib/constantes";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Candidato, TipoEmail } from "@/types/database";
import { DEFINICOES_FASE, type Fase } from "@/lib/constantes-fases";
import {
  DEFINICOES_MODALIDADE,
  jaEscolheu,
  MAXIMO_TENTATIVAS,
  POR_ESCOLHER,
  type ModalidadeGravada,
} from "@/lib/entrevista/modalidade";
import { dataCurta, dataHora, porExtenso } from "@/lib/datas";

/**
 * ===========================================================================
 * COMUNICAÇÃO COM OS CANDIDATOS
 * ---------------------------------------------------------------------------
 * Gmail por SMTP com palavra-passe de aplicação: não exige ecrã de
 * consentimento nem renovação de tokens, e cabe no limite de tempo das
 * funções da Vercel.
 *
 * Regra que atravessa todos os modelos: o email NUNCA leva um link de acesso
 * à candidatura. Informa, e informa bem, mas quem quiser saber mais fala com
 * a equipa. É o que evita que um link reencaminhado dê a terceiros acesso a
 * dados pessoais de outra pessoa.
 * ===========================================================================
 */

let transportador: nodemailer.Transporter | null = null;

function obterTransportador() {
  if (transportador) return transportador;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ""); // o Google mostra a chave com espaços

  if (!user || !pass) {
    throw new Error("Faltam as variáveis GMAIL_USER / GMAIL_APP_PASSWORD.");
  }

  transportador = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transportador;
}

const remetente = (nomePersonalizado?: string) =>
  `"${nomePersonalizado || process.env.EMAIL_REMETENTE_NOME || `${EMPRESA.nome} - Recrutamento`}" <${process.env.GMAIL_USER}>`;

/** Escapa HTML para não partir o email nem abrir buracos de injecção. */
function esc(texto: string | null | undefined): string {
  if (!texto) return "-";
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const simNao = (v: boolean) => (v ? "Sim" : "Não");
const primeiroNome = (c: Candidato) => c.nome.trim().split(/\s+/)[0];
const referencia = (c: Candidato) => c.id.slice(0, 8).toUpperCase();

/** 12 de Setembro de 2026, às 14h30 */
export function dataPorExtenso(iso: string): string {
  // Sempre na hora de Angola: o servidor da Vercel corre em UTC e, sem isto,
  // o candidato recebia um email a dizer uma hora antes da hora certa.
  return porExtenso(iso);
}

// ---------------------------------------------------------------------------
// MOLDE COMUM
// ---------------------------------------------------------------------------

function molde(titulo: string, corpo: string, faixa: string = EMPRESA.cores.vermelho): string {
  return `<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#141414;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
      <tr>
        <td style="background:${EMPRESA.cores.preto};padding:22px 28px;">
          <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:1px;">
            CONSUL<span style="color:${EMPRESA.cores.amarelo};">VOLT</span>
          </div>
          <div style="font-size:12px;color:#d4d4d8;margin-top:4px;">Recrutamento - ${EMPRESA.vaga}</div>
        </td>
      </tr>
      <tr><td style="height:4px;background:${faixa};"></td></tr>
      <tr>
        <td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:19px;color:${EMPRESA.cores.preto};">${titulo}</h1>
          ${corpo}
        </td>
      </tr>
      <tr>
        <td style="padding:18px 28px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:11px;color:#71717a;line-height:1.6;">
          ${EMPRESA.nomeCompleto}<br/>
          ${EMPRESA.morada}<br/>
          <a href="${EMPRESA.site}" style="color:${EMPRESA.cores.vermelho};text-decoration:none;">${EMPRESA.site}</a>
          <br/><br/>
          Esta mensagem foi enviada automaticamente. Se precisares de falar connosco, responde ao contacto que te for dado pela equipa de recrutamento.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const linha = (rotulo: string, valor: string) => `
  <tr>
    <td style="padding:7px 12px;background:#fafafa;border:1px solid #e4e4e7;font-size:13px;color:#52525b;width:42%;">${rotulo}</td>
    <td style="padding:7px 12px;border:1px solid #e4e4e7;font-size:13px;font-weight:600;">${valor}</td>
  </tr>`;

const paragrafo = (texto: string) =>
  `<p style="font-size:15px;line-height:1.7;margin:0 0 14px;">${texto}</p>`;

const caixa = (cor: string, fundo: string, conteudo: string) =>
  `<div style="border-left:4px solid ${cor};background:${fundo};padding:14px 16px;border-radius:0 8px 8px 0;margin:0 0 18px;">${conteudo}</div>`;

// ---------------------------------------------------------------------------
// REGISTO
// ---------------------------------------------------------------------------

async function registar(
  candidatoId: string,
  tipo: TipoEmail,
  destinatario: string,
  assunto: string,
  resumo: string,
  estado: "enviado" | "erro",
  erro?: string,
  enviadoPor?: string
) {
  try {
    await criarClienteServidor().from("emails_enviados").insert({
      candidato_id: candidatoId,
      tipo,
      destinatario,
      assunto,
      resumo: resumo.slice(0, 300),
      estado,
      erro: erro?.slice(0, 500) ?? null,
      enviado_por: enviadoPor ?? null,
    });
  } catch (e) {
    // O registo é para o RH saber o que saiu; se falhar, não trava o envio.
    console.error("[email] não consegui registar o envio:", e);
  }
}

interface Envio {
  para: string | string[];
  assunto: string;
  html: string;
  texto: string;
  responderA?: string;
  nomeRemetente?: string;
}

/** Envia e regista. Devolve o erro em vez de o atirar, para o chamador decidir. */
async function enviar(
  candidatoId: string,
  tipo: TipoEmail,
  e: Envio,
  resumo: string,
  enviadoPor?: string
): Promise<{ ok: boolean; erro?: string }> {
  const destinatario = Array.isArray(e.para) ? e.para.join(", ") : e.para;

  try {
    await obterTransportador().sendMail({
      from: remetente(e.nomeRemetente),
      to: e.para,
      replyTo: e.responderA,
      subject: e.assunto,
      html: e.html,
      text: e.texto,
    });
    await registar(candidatoId, tipo, destinatario, e.assunto, resumo, "enviado", undefined, enviadoPor);
    return { ok: true };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    console.error(`[email] ${tipo} para ${destinatario} falhou:`, msg);
    await registar(candidatoId, tipo, destinatario, e.assunto, resumo, "erro", msg, enviadoPor);
    return { ok: false, erro: msg };
  }
}

// ---------------------------------------------------------------------------
// 1. CONFIRMAÇÃO DE CANDIDATURA
// ---------------------------------------------------------------------------

/**
 * Diz ao candidato exactamente o que recebemos e o que se segue.
 * Sem link de acesso: o email informa, não dá entrada no processo.
 */
export async function enviarEmailCandidato(c: Candidato) {
  const ref = referencia(c);

  const corpo = `
    ${paragrafo(`Olá <strong>${esc(primeiroNome(c))}</strong>,`)}
    ${paragrafo(
      `Recebemos a tua candidatura à vaga de <strong>${EMPRESA.vaga}</strong> e está registada com sucesso. Abaixo está tudo o que ficou no nosso sistema, para confirmares que não há nada trocado.`
    )}

    ${caixa(
      EMPRESA.cores.amarelo,
      "#fefce8",
      `<p style="margin:0;font-size:13px;color:#713f12;">A tua referência é <strong style="font-size:16px;letter-spacing:1px;">${ref}</strong>. Guarda-a: é por ela que te identificamos em qualquer contacto.</p>`
    )}

    <h2 style="font-size:14px;margin:22px 0 8px;color:#52525b;text-transform:uppercase;letter-spacing:.05em;">O que registámos</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;">
      ${linha("Nome", esc(c.nome))}
      ${linha("Nº de BI", esc(c.bi))}
      ${linha("Província", esc(c.provincia))}
      ${linha("Município", esc(c.municipio))}
      ${linha("Telefone", esc(c.telefone))}
      ${linha("Email", esc(c.email))}
      ${linha("Nível académico", esc(c.nivel_academico))}
      ${linha("Curso", esc(c.curso))}
      ${linha("Conhecimento MT/BT", simNao(c.conhece_mtbt))}
      ${linha("Carta de condução", simNao(c.tem_carta))}
      ${linha("Experiência em trabalhos similares", simNao(c.experiencia_similar))}
      ${linha("Documentos recebidos", `${[c.cv_url, c.bi_url, c.certificado_url, c.experiencia_url].filter(Boolean).length} ficheiro(s)`)}
      ${linha("Data da candidatura", dataCurta(c.created_at))}
    </table>

    <h2 style="font-size:14px;margin:22px 0 8px;color:#52525b;text-transform:uppercase;letter-spacing:.05em;">O que acontece a seguir</h2>
    <ol style="margin:0 0 18px;padding-left:20px;font-size:15px;line-height:1.8;color:#3f3f46;">
      <li>A equipa analisa o teu processo e os documentos que anexaste.</li>
      <li>Se o perfil corresponder ao que o projecto precisa, entramos em contacto <strong>pelo ${esc(c.telefone)}</strong>, por chamada ou WhatsApp, e recebes um email com a data da entrevista.</li>
      <li>Se não avançares nesta fase, também te dizemos - não ficas à espera sem resposta.</li>
    </ol>

    ${caixa(
      "#94a3b8",
      "#f8fafc",
      `<p style="margin:0;font-size:13px;color:#475569;line-height:1.6;"><strong>Atenção:</strong> este processo é gratuito do princípio ao fim. A ${EMPRESA.nome} nunca pede dinheiro a candidatos, em fase nenhuma. Se alguém to pedir em nosso nome, não pagues e avisa-nos.</p>`
    )}

    ${paragrafo(`Com os melhores cumprimentos,<br/><strong>Equipa de Recrutamento - ${EMPRESA.nome}</strong>`)}`;

  const texto =
    `Olá ${primeiroNome(c)},\n\n` +
    `Recebemos a tua candidatura à vaga de ${EMPRESA.vaga}.\n\n` +
    `Referência: ${ref}\n` +
    `Nome: ${c.nome}\nBI: ${c.bi}\nProvíncia: ${c.provincia}\nMunicípio: ${c.municipio}\n` +
    `Telefone: ${c.telefone}\nEmail: ${c.email}\n` +
    `Nível: ${c.nivel_academico}\nCurso: ${c.curso ?? "-"}\n` +
    `MT/BT: ${simNao(c.conhece_mtbt)} | Carta: ${simNao(c.tem_carta)} | Experiência: ${simNao(c.experiencia_similar)}\n\n` +
    `A seguir: analisamos o processo e, se avançares, contactamos-te pelo ${c.telefone} e recebes email com a data da entrevista. Se não avançares, também te dizemos.\n\n` +
    `Este processo é gratuito. A ${EMPRESA.nome} nunca pede dinheiro a candidatos.\n\n` +
    `Equipa de Recrutamento - ${EMPRESA.nome}\n${EMPRESA.site}`;

  return enviar(
    c.id,
    "confirmacao",
    {
      para: c.email,
      assunto: `Candidatura recebida (ref. ${ref}) - ${EMPRESA.vaga} | ${EMPRESA.nome}`,
      html: molde("Candidatura recebida", corpo),
      texto,
    },
    "Confirmação de recepção com o resumo dos dados registados."
  );
}

// ---------------------------------------------------------------------------
// 2. APROVAÇÃO COM ENTREVISTA MARCADA
// ---------------------------------------------------------------------------

export interface DadosEntrevista {
  quando: string; // ISO
  local: string;
  notas?: string | null;
}

export async function enviarEmailAprovacao(
  c: Candidato,
  entrevista: DadosEntrevista,
  enviadoPor?: string
) {
  const ref = referencia(c);
  const quando = dataPorExtenso(entrevista.quando);

  const corpo = `
    ${paragrafo(`Olá <strong>${esc(primeiroNome(c))}</strong>,`)}
    ${paragrafo(
      `Temos boas notícias: a tua candidatura à vaga de <strong>${EMPRESA.vaga}</strong> foi <strong>seleccionada</strong> e queremos conhecer-te pessoalmente.`
    )}

    ${caixa(
      "#16a34a",
      "#f0fdf4",
      `<p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#15803d;">Entrevista marcada</p>
       <p style="margin:0;font-size:19px;font-weight:700;color:#14532d;">${esc(quando)}</p>
       <p style="margin:8px 0 0;font-size:14px;color:#166534;">${esc(entrevista.local)}</p>`
    )}

    ${
      entrevista.notas
        ? `<h2 style="font-size:14px;margin:22px 0 8px;color:#52525b;text-transform:uppercase;letter-spacing:.05em;">O que deves saber</h2>
           <p style="font-size:15px;line-height:1.7;margin:0 0 18px;white-space:pre-wrap;">${esc(entrevista.notas)}</p>`
        : ""
    }

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;">
      ${linha("Referência da candidatura", ref)}
      ${linha("Nome", esc(c.nome))}
      ${linha("Nº de BI", esc(c.bi))}
    </table>

    ${paragrafo(
      `<strong>Não podes nesse dia ou hora?</strong> Avisa-nos assim que possível pelo mesmo contacto por onde falámos contigo, para remarcarmos. Não percas a vaga por causa de um desencontro de agenda.`
    )}

    ${caixa(
      "#94a3b8",
      "#f8fafc",
      `<p style="margin:0;font-size:13px;color:#475569;line-height:1.6;"><strong>Atenção:</strong> este processo é gratuito. A ${EMPRESA.nome} nunca pede dinheiro a candidatos, nem para entrevistas, nem para exames, nem para material.</p>`
    )}

    ${paragrafo(`Até breve,<br/><strong>Equipa de Recrutamento - ${EMPRESA.nome}</strong>`)}`;

  const texto =
    `Olá ${primeiroNome(c)},\n\n` +
    `A tua candidatura à vaga de ${EMPRESA.vaga} foi SELECCIONADA.\n\n` +
    `ENTREVISTA\n${quando}\n${entrevista.local}\n\n` +
    (entrevista.notas ? `${entrevista.notas}\n\n` : "") +
    `Referência: ${ref}\nNome: ${c.nome}\nBI: ${c.bi}\n\n` +
    `Se não puderes nesse dia, avisa-nos para remarcarmos.\n\n` +
    `Este processo é gratuito. A ${EMPRESA.nome} nunca pede dinheiro a candidatos.\n\n` +
    `Equipa de Recrutamento - ${EMPRESA.nome}\n${EMPRESA.site}`;

  return enviar(
    c.id,
    "aprovacao",
    {
      para: c.email,
      assunto: `Foste seleccionado - entrevista a ${quando} | ${EMPRESA.nome}`,
      html: molde("Candidatura seleccionada", corpo, "#16a34a"),
      texto,
    },
    `Aprovação com entrevista marcada para ${quando}, em ${entrevista.local}.`,
    enviadoPor
  );
}

// ---------------------------------------------------------------------------
// 2b. CONVOCATÓRIA POR FASE (entrevista, formação, teste de fluxo, reunião)
// ---------------------------------------------------------------------------

/**
 * Convoca o candidato para uma fase do processo.
 *
 * É o mesmo email para as quatro fases, com o texto que a fase define e o
 * que a equipa tiver escrito por cima. Serve tanto para uma pessoa como para
 * uma marcação em massa - quem chama é que decide.
 */
export async function enviarEmailFase(
  c: Candidato,
  fase: Fase,
  evento: {
    quando: string;
    local: string;
    notas?: string | null;
    /**
     * Videochamada, chamada, ou `por_escolher` quando é o candidato que
     * decide. Nulo mantém o email exactamente como sempre foi.
     */
    modalidade?: ModalidadeGravada | null;
    /** Link do Meet. Só se usa na videochamada. */
    link?: string | null;
  },
  enviadoPor?: string
) {
  const d = DEFINICOES_FASE[fase];
  const ref = referencia(c);
  const quando = dataPorExtenso(evento.quando);
  const notas = evento.notas?.trim() || d.notas;

  // Como se faz a entrevista. Só entra no email quando foi escolhida uma
  // modalidade: as marcações feitas antes disto continuam com o email de
  // sempre, sem uma linha a mais.
  const escolhePeloCandidato = evento.modalidade === POR_ESCOLHER;
  const m = jaEscolheu(evento.modalidade) ? DEFINICOES_MODALIDADE[evento.modalidade] : null;
  const link = evento.link?.trim() || "";

  const corpo = `
    ${paragrafo(`Olá <strong>${esc(primeiroNome(c))}</strong>,`)}
    ${paragrafo(esc(d.abertura))}

    ${caixa(
      d.cor,
      "#fafafa",
      `<p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:${d.cor};">${esc(d.destaque)}</p>
       <p style="margin:0;font-size:19px;font-weight:700;color:${EMPRESA.cores.preto};">${esc(quando)}</p>
       <p style="margin:8px 0 0;font-size:14px;color:#3f3f46;">${esc(evento.local)}</p>`
    )}

    ${
      escolhePeloCandidato
        ? caixa(
            "#0f766e",
            "#f0fdfa",
            `<p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#52525b;">Escolhe como queres ser entrevistado</p>
             <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#3f3f46;">
               <strong>Responde a este email</strong> a dizer qual das duas preferes. Sem essa resposta
               não conseguimos preparar a tua entrevista.
             </p>

             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 8px;">
               <tr><td style="background:#ffffff;border:1px solid #bae6fd;border-radius:8px;padding:12px 14px;">
                 <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0c4a6e;">1. Videochamada</p>
                 <p style="margin:0;font-size:14px;line-height:1.6;color:#3f3f46;">${esc(DEFINICOES_MODALIDADE.videochamada.explicacao)}</p>
                 ${
                   link
                     ? `<p style="margin:10px 0 0;font-size:13px;color:#0369a1;word-break:break-all;">A tua sala já está reservada: ${esc(link)}</p>`
                     : ""
                 }
               </td></tr>
               <tr><td style="background:#ffffff;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;">
                 <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#9a3412;">2. Chamada telefónica</p>
                 <p style="margin:0;font-size:14px;line-height:1.6;color:#3f3f46;">${esc(DEFINICOES_MODALIDADE.chamada.explicacao)}</p>
                 <p style="margin:10px 0 0;font-size:13px;color:#9a3412;">Ligaríamos para <strong>${esc(c.telefone)}</strong>.</p>
               </td></tr>
             </table>

             <p style="margin:14px 0 0;font-size:14px;color:#3f3f46;">
               Basta responderes com a palavra <strong>videochamada</strong> ou <strong>chamada</strong>.
             </p>`
          )
        : m
        ? caixa(
            m.chave === "videochamada" ? "#0284c7" : "#d97706",
            m.chave === "videochamada" ? "#f0f9ff" : "#fffbeb",
            `<p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#52525b;">Como vai ser a entrevista</p>
             <p style="margin:0 0 8px;font-size:17px;font-weight:700;color:${EMPRESA.cores.preto};">${esc(m.rotulo)}</p>
             <p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46;">${esc(m.explicacao)}</p>` +
              (m.chave === "videochamada" && link
                ? `<p style="margin:14px 0 0;">
                     <a href="${esc(link)}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:8px;">Entrar na videochamada</a>
                   </p>
                   <p style="margin:10px 0 0;font-size:12px;color:#64748b;word-break:break-all;">Se o botão não abrir, copia este endereço: ${esc(link)}</p>`
                : "") +
              (m.chave === "chamada"
                ? `<p style="margin:14px 0 0;font-size:14px;color:#3f3f46;">Vamos ligar para <strong>${esc(c.telefone)}</strong>. Se este número já não for o teu, responde a este email a dizer qual é.</p>`
                : "")
          )
        : ""
    }

    ${
      notas
        ? `<h2 style="font-size:14px;margin:22px 0 8px;color:#52525b;text-transform:uppercase;letter-spacing:.05em;">O que deves saber</h2>
           <p style="font-size:15px;line-height:1.7;margin:0 0 18px;white-space:pre-wrap;">${esc(notas)}</p>`
        : ""
    }

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;">
      ${linha("Referência da candidatura", ref)}
      ${linha("Nome", esc(c.nome))}
      ${linha("Nº de BI", esc(c.bi))}
    </table>

    ${paragrafo(
      m?.chave === "chamada"
        ? `<strong>Não podes nesse dia ou hora?</strong> Avisa-nos ANTES da hora marcada, pelo mesmo contacto por onde falámos contigo. Depois de feitas as ${MAXIMO_TENTATIVAS} chamadas sem resposta, a entrevista não volta a ser marcada.`
        : escolhePeloCandidato
          ? `<strong>Não podes nesse dia ou hora?</strong> Diz-nos na mesma resposta em que escolheres a forma da entrevista, e remarcamos.`
          : `<strong>Não podes nesse dia ou hora?</strong> Avisa-nos assim que possível pelo mesmo contacto por onde falámos contigo.`
    )}

    ${caixa(
      "#94a3b8",
      "#f8fafc",
      `<p style="margin:0;font-size:13px;color:#475569;line-height:1.6;"><strong>Atenção:</strong> este processo é gratuito. A ${EMPRESA.nome} nunca pede dinheiro a candidatos, nem para entrevistas, nem para formação, nem para material.</p>`
    )}

    ${paragrafo(`Até breve,<br/><strong>Equipa de Recrutamento - ${EMPRESA.nome}</strong>`)}`;

  const texto =
    `Olá ${primeiroNome(c)},\n\n` +
    `${d.abertura}\n\n` +
    `${d.destaque.toUpperCase()}\n${quando}\n${evento.local}\n\n` +
    (notas ? `${notas}\n\n` : "") +
    `Referência: ${ref}\nNome: ${c.nome}\nBI: ${c.bi}\n\n` +
    `Se não puderes nesse dia, avisa-nos.\n\n` +
    `Este processo é gratuito. A ${EMPRESA.nome} nunca pede dinheiro a candidatos.\n\n` +
    `Equipa de Recrutamento - ${EMPRESA.nome}\n${EMPRESA.site}`;

  return enviar(
    c.id,
    fase as TipoEmail,
    {
      para: c.email,
      assunto: `${d.assunto} - ${quando} | ${EMPRESA.nome}`,
      html: molde(d.destaque, corpo, d.cor),
      texto,
    },
    `${d.rotulo} marcada para ${quando}, em ${evento.local}.`,
    enviadoPor
  );
}

// ---------------------------------------------------------------------------
// 3. ALTERAÇÃO OU LEMBRETE DE ENTREVISTA
// ---------------------------------------------------------------------------

export async function enviarEmailEntrevista(
  c: Candidato,
  entrevista: DadosEntrevista,
  motivo: "remarcada" | "lembrete",
  enviadoPor?: string
) {
  const quando = dataPorExtenso(entrevista.quando);
  const remarcada = motivo === "remarcada";

  const corpo = `
    ${paragrafo(`Olá <strong>${esc(primeiroNome(c))}</strong>,`)}
    ${paragrafo(
      remarcada
        ? `A tua entrevista para a vaga de <strong>${EMPRESA.vaga}</strong> foi <strong>remarcada</strong>. A data anterior deixa de ser válida - vale a que está aqui em baixo.`
        : `Lembrete da tua entrevista para a vaga de <strong>${EMPRESA.vaga}</strong>.`
    )}

    ${caixa(
      "#0284c7",
      "#f0f9ff",
      `<p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#0369a1;">${remarcada ? "Nova data" : "Entrevista"}</p>
       <p style="margin:0;font-size:19px;font-weight:700;color:#0c4a6e;">${esc(quando)}</p>
       <p style="margin:8px 0 0;font-size:14px;color:#075985;">${esc(entrevista.local)}</p>`
    )}

    ${
      entrevista.notas
        ? `<p style="font-size:15px;line-height:1.7;margin:0 0 18px;white-space:pre-wrap;">${esc(entrevista.notas)}</p>`
        : ""
    }

    ${paragrafo(`Referência da tua candidatura: <strong>${referencia(c)}</strong>.`)}
    ${paragrafo(`Até breve,<br/><strong>Equipa de Recrutamento - ${EMPRESA.nome}</strong>`)}`;

  const texto =
    `Olá ${primeiroNome(c)},\n\n` +
    (remarcada
      ? `A tua entrevista foi REMARCADA. A data anterior deixa de ser válida.\n\n`
      : `Lembrete da tua entrevista.\n\n`) +
    `${quando}\n${entrevista.local}\n\n` +
    (entrevista.notas ? `${entrevista.notas}\n\n` : "") +
    `Referência: ${referencia(c)}\n\nEquipa de Recrutamento - ${EMPRESA.nome}`;

  return enviar(
    c.id,
    "entrevista",
    {
      para: c.email,
      assunto: remarcada
        ? `Entrevista remarcada para ${quando} | ${EMPRESA.nome}`
        : `Lembrete: entrevista a ${quando} | ${EMPRESA.nome}`,
      html: molde(remarcada ? "Entrevista remarcada" : "Lembrete de entrevista", corpo, "#0284c7"),
      texto,
    },
    `${remarcada ? "Remarcação" : "Lembrete"} para ${quando}.`,
    enviadoPor
  );
}

// ---------------------------------------------------------------------------
// 4. NÃO SELECÇÃO
// ---------------------------------------------------------------------------

export async function enviarEmailReprovacao(c: Candidato, nota?: string | null, enviadoPor?: string) {
  const corpo = `
    ${paragrafo(`Olá <strong>${esc(primeiroNome(c))}</strong>,`)}
    ${paragrafo(
      `Obrigado pelo tempo que dedicaste à tua candidatura à vaga de <strong>${EMPRESA.vaga}</strong>.`
    )}
    ${paragrafo(
      `Depois de analisarmos os processos recebidos, desta vez o teu perfil não foi seleccionado para avançar. A decisão não põe em causa as tuas competências: o número de vagas é limitado e tivemos de escolher entre muitos candidatos com boa preparação.`
    )}
    ${nota ? `<p style="font-size:15px;line-height:1.7;margin:0 0 14px;white-space:pre-wrap;">${esc(nota)}</p>` : ""}
    ${paragrafo(
      `Os teus dados ficam na nossa base de candidatos e voltamos a contactar-te se surgir uma oportunidade que te sirva. Se preferires que apaguemos o teu processo, é só dizeres.`
    )}
    ${paragrafo(`Com os melhores cumprimentos,<br/><strong>Equipa de Recrutamento - ${EMPRESA.nome}</strong>`)}`;

  const texto =
    `Olá ${primeiroNome(c)},\n\n` +
    `Obrigado pela tua candidatura à vaga de ${EMPRESA.vaga}.\n\n` +
    `Desta vez o teu perfil não foi seleccionado para avançar. O número de vagas é limitado e tivemos de escolher entre muitos candidatos bem preparados.\n\n` +
    (nota ? `${nota}\n\n` : "") +
    `Os teus dados ficam na nossa base para futuras oportunidades. Se preferires que os apaguemos, é só dizeres.\n\n` +
    `Equipa de Recrutamento - ${EMPRESA.nome}`;

  return enviar(
    c.id,
    "reprovacao",
    {
      para: c.email,
      assunto: `Resultado da tua candidatura - ${EMPRESA.vaga} | ${EMPRESA.nome}`,
      html: molde("Resultado da candidatura", corpo, "#71717a"),
      texto,
    },
    "Comunicação de não selecção.",
    enviadoPor
  );
}

// ---------------------------------------------------------------------------
// 5. MENSAGEM ESCRITA À MÃO PELO RH
// ---------------------------------------------------------------------------
// 4b. AGRADECIMENTO DEPOIS DA ENTREVISTA
// ---------------------------------------------------------------------------

/**
 * Sai quando a avaliação da entrevista é guardada.
 *
 * NÃO diz se a pessoa passou ou não passou, e isso é de propósito. A nota da
 * entrevista é ordenação sugerida, não decisão; a decisão vem depois, e tem o
 * seu próprio email. Um agradecimento que deixasse adivinhar o resultado
 * punha o candidato a ler nas entrelinhas uma coisa que ainda não aconteceu.
 */
export async function enviarEmailAgradecimento(
  c: Candidato,
  nota?: string | null,
  enviadoPor?: string
) {
  const corpo = `
    ${paragrafo(`Olá <strong>${esc(primeiroNome(c))}</strong>,`)}
    ${paragrafo(
      `Obrigado pelo tempo que nos deste hoje na entrevista para a vaga de <strong>${EMPRESA.vaga}</strong>.`
    )}
    ${paragrafo(
      `Ficámos com o registo da conversa. Vamos agora ouvir os restantes candidatos e voltamos a contactar-te assim que houver uma decisão, seja ela qual for.`
    )}
    ${nota ? `<p style="font-size:15px;line-height:1.7;margin:0 0 14px;white-space:pre-wrap;">${esc(nota)}</p>` : ""}
    ${paragrafo(`Referência da tua candidatura: <strong>${referencia(c)}</strong>.`)}
    ${paragrafo(`Com os melhores cumprimentos,<br/><strong>Equipa de Recrutamento - ${EMPRESA.nome}</strong>`)}`;

  const texto =
    `Olá ${primeiroNome(c)},\n\n` +
    `Obrigado pelo tempo que nos deste hoje na entrevista para a vaga de ${EMPRESA.vaga}.\n\n` +
    `Vamos ouvir os restantes candidatos e voltamos a contactar-te assim que houver uma decisão.\n\n` +
    (nota ? `${nota}\n\n` : "") +
    `Referência: ${referencia(c)}\n\n` +
    `Equipa de Recrutamento - ${EMPRESA.nome}`;

  return enviar(
    c.id,
    "agradecimento",
    {
      para: c.email,
      assunto: `Obrigado pela entrevista - ${EMPRESA.vaga} | ${EMPRESA.nome}`,
      html: molde("Obrigado pela entrevista", corpo, "#0d9488"),
      texto,
    },
    "Agradecimento enviado depois da entrevista.",
    enviadoPor
  );
}

// ---------------------------------------------------------------------------

export async function enviarEmailPersonalizado(
  c: Candidato,
  assunto: string,
  mensagem: string,
  enviadoPor?: string
) {
  const corpo = `
    ${paragrafo(`Olá <strong>${esc(primeiroNome(c))}</strong>,`)}
    <div style="font-size:15px;line-height:1.7;margin:0 0 18px;white-space:pre-wrap;">${esc(mensagem)}</div>
    ${paragrafo(`Referência da tua candidatura: <strong>${referencia(c)}</strong>.`)}
    ${paragrafo(`Com os melhores cumprimentos,<br/><strong>Equipa de Recrutamento - ${EMPRESA.nome}</strong>`)}`;

  return enviar(
    c.id,
    "personalizado",
    {
      para: c.email,
      assunto,
      html: molde(assunto, corpo),
      texto: `Olá ${primeiroNome(c)},\n\n${mensagem}\n\nReferência: ${referencia(c)}\n\nEquipa de Recrutamento - ${EMPRESA.nome}`,
    },
    mensagem,
    enviadoPor
  );
}

// ---------------------------------------------------------------------------
// 6. AVISO INTERNO PARA O RH
// ---------------------------------------------------------------------------

export async function enviarEmailRH(c: Candidato, pastaUrl: string | null) {
  const destinatarios = (process.env.RH_EMAIL || "recrutamento@consulvolt.pt")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const painel = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/admin/candidato/${c.id}`;
  const whatsapp = `https://wa.me/${c.telefone}`;

  const botao = (texto: string, url: string, cor: string) => `
    <a href="${url}" style="display:inline-block;padding:11px 20px;margin:0 8px 8px 0;background:${cor};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">${texto}</a>`;

  const corpo = `
    ${paragrafo(`Entrou uma nova candidatura para <strong>${EMPRESA.vaga}</strong>.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;">
      ${linha("Nome completo", esc(c.nome))}
      ${linha("Nº de BI", esc(c.bi))}
      ${linha("Província", esc(c.provincia))}
      ${linha("Município", esc(c.municipio))}
      ${linha("Telefone / WhatsApp", esc(c.telefone))}
      ${linha("Email", esc(c.email))}
      ${linha("Nível académico", esc(c.nivel_academico))}
      ${linha("Curso", esc(c.curso))}
      ${linha("Conhece MT/BT", simNao(c.conhece_mtbt))}
      ${linha("Carta de condução", simNao(c.tem_carta))}
      ${linha(
        "Experiência em trabalhos similares",
        c.experiencia_similar
          ? c.experiencia_url
            ? "Sim (com comprovativo)"
            : "Sim (sem comprovativo)"
          : "Não"
      )}
      ${linha("Condições de trabalho", c.condicoes_aceites ? "Confirmadas" : "Sem confirmação")}
      ${linha("Data da candidatura", dataHora(c.created_at))}
    </table>
    <div>
      ${pastaUrl ? botao("Abrir documentos no Drive", pastaUrl, EMPRESA.cores.vermelho) : ""}
      ${botao("Ver no painel", painel, EMPRESA.cores.preto)}
      ${botao("WhatsApp", whatsapp, "#25D366")}
    </div>
    ${
      pastaUrl
        ? ""
        : `<p style="font-size:13px;color:#b45309;background:#fef3c7;padding:10px 12px;border-radius:8px;margin:12px 0 0;">Os documentos ainda não foram copiados para o Google Drive. Podes descarregá-los pelo painel.</p>`
    }`;

  const texto =
    `Nova candidatura - ${EMPRESA.vaga}\n\n` +
    `Nome: ${c.nome}\nBI: ${c.bi}\nProvíncia: ${c.provincia}\nMunicípio: ${c.municipio}\n` +
    `Telefone: ${c.telefone}\nEmail: ${c.email}\n` +
    `Nível: ${c.nivel_academico}\nCurso: ${c.curso ?? "-"}\n` +
    `MT/BT: ${simNao(c.conhece_mtbt)} | Carta: ${simNao(c.tem_carta)}\n` +
    `Experiência similar: ${simNao(c.experiencia_similar)}${c.experiencia_url ? " (com comprovativo)" : ""}\n\n` +
    `Drive: ${pastaUrl ?? "(por arquivar)"}\nPainel: ${painel}\nWhatsApp: ${whatsapp}`;

  return enviar(
    c.id,
    "rh",
    {
      para: destinatarios,
      responderA: c.email,
      assunto: `[Candidatura] ${c.nome} - ${c.municipio} | ${EMPRESA.vaga}`,
      html: molde("Nova candidatura recebida", corpo),
      texto,
    },
    `Aviso interno sobre a candidatura de ${c.nome}.`
  );
}

// ---------------------------------------------------------------------------
// DIAGNÓSTICO
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// EMAILS PARA A EQUIPA DO PAINEL (não são candidatos)
// ---------------------------------------------------------------------------

/**
 * Envia e regista em emails_equipa.
 *
 * Nunca guarda a palavra-passe em lado nenhum: ela existe em memória o tempo
 * de ser cifrada e de entrar no corpo da mensagem, e mais nada. Nem o
 * administrador que criou a conta a chega a ver.
 */
async function enviarInterno(
  destinatario: string,
  tipo: "conta_criada" | "palavra_passe_reposta" | "aviso",
  assunto: string,
  html: string,
  texto: string,
  enviadoPor?: string
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = criarClienteServidor();
  let erro: string | undefined;

  try {
    await obterTransportador().sendMail({
      from: remetente(),
      to: destinatario,
      subject: assunto,
      html,
      text: texto,
    });
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
    console.error(`[email equipa] ${tipo} para ${destinatario} falhou:`, erro);
  }

  try {
    await supabase.from("emails_equipa").insert({
      destinatario,
      tipo,
      assunto,
      estado: erro ? "erro" : "enviado",
      erro: erro?.slice(0, 500) ?? null,
      enviado_por: enviadoPor ?? null,
    });
  } catch (e) {
    // A tabela pode não existir ainda. O email é que interessa.
    console.error("[email equipa] não consegui registar:", e);
  }

  return erro ? { ok: false, erro } : { ok: true };
}

/** O bloco com as credenciais, igual nos dois emails. */
function blocoCredenciais(utilizador: string, palavraPasse: string, endereco: string): string {
  return `
    ${caixa(
      EMPRESA.cores.vermelho,
      "#fff7f7",
      `<p style="margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:${EMPRESA.cores.vermelho};">Os teus dados de acesso</p>
       <p style="margin:0 0 6px;font-size:14px;color:#3f3f46;">Utilizador</p>
       <p style="margin:0 0 12px;font-family:Consolas,Menlo,monospace;font-size:18px;font-weight:700;color:${EMPRESA.cores.preto};">${esc(utilizador)}</p>
       <p style="margin:0 0 6px;font-size:14px;color:#3f3f46;">Palavra-passe</p>
       <p style="margin:0;font-family:Consolas,Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:1px;color:${EMPRESA.cores.preto};">${esc(palavraPasse)}</p>`
    )}

    ${paragrafo(
      `<a href="${endereco}" style="display:inline-block;background:${EMPRESA.cores.vermelho};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Entrar no painel</a>`
    )}

    ${caixa(
      "#f59e0b",
      "#fffbeb",
      `<p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;"><strong>Vais ter de trocar esta palavra-passe assim que entrares.</strong> Ela foi gerada pelo sistema e ninguém da equipa a conhece, nem quem criou a conta. Escolhe uma que só tu saibas e não a partilhes com ninguém.</p>`
    )}`;
}

/** Conta criada: dá as boas-vindas e entrega as credenciais. */
export async function enviarEmailContaCriada(
  conta: { nome: string; utilizador: string; email: string; papel: string },
  palavraPasse: string,
  endereco: string,
  enviadoPor?: string
) {
  const corpo = `
    ${paragrafo(`Olá <strong>${esc(conta.nome.split(" ")[0])}</strong>,`)}
    ${paragrafo(
      `Foi criada uma conta para ti no painel de recrutamento da ${EMPRESA.nome}, para o ${EMPRESA.projecto}. O teu perfil de acesso é <strong>${esc(conta.papel)}</strong>.`
    )}

    ${blocoCredenciais(conta.utilizador, palavraPasse, endereco)}

    ${paragrafo(
      `Se não estavas à espera deste email, avisa a equipa de recrutamento e não uses estes dados.`
    )}

    ${paragrafo(`Bem-vindo,<br/><strong>Equipa de Recrutamento - ${EMPRESA.nome}</strong>`)}`;

  const texto =
    `Olá ${conta.nome.split(" ")[0]},\n\n` +
    `Foi criada uma conta para ti no painel de recrutamento da ${EMPRESA.nome}.\n` +
    `Perfil de acesso: ${conta.papel}\n\n` +
    `Utilizador: ${conta.utilizador}\nPalavra-passe: ${palavraPasse}\n\n` +
    `Entra em ${endereco}\n\n` +
    `Vais ter de trocar esta palavra-passe assim que entrares. Ela foi gerada pelo\n` +
    `sistema e ninguém da equipa a conhece.\n\n` +
    `Equipa de Recrutamento - ${EMPRESA.nome}`;

  return enviarInterno(
    conta.email,
    "conta_criada",
    `A tua conta no painel de recrutamento | ${EMPRESA.nome}`,
    molde("Conta criada", corpo, EMPRESA.cores.vermelho),
    texto,
    enviadoPor
  );
}

/** Palavra-passe reposta por um administrador. */
export async function enviarEmailPalavraPasseReposta(
  conta: { nome: string; utilizador: string; email: string },
  palavraPasse: string,
  endereco: string,
  enviadoPor?: string
) {
  const corpo = `
    ${paragrafo(`Olá <strong>${esc(conta.nome.split(" ")[0])}</strong>,`)}
    ${paragrafo(
      `Um administrador pediu uma palavra-passe nova para a tua conta do painel de recrutamento. A anterior deixou de funcionar.`
    )}

    ${blocoCredenciais(conta.utilizador, palavraPasse, endereco)}

    ${paragrafo(
      `<strong>Não foste tu que pediste?</strong> Avisa já a equipa de recrutamento: alguém com acesso de administrador fez este pedido.`
    )}

    ${paragrafo(`<strong>Equipa de Recrutamento - ${EMPRESA.nome}</strong>`)}`;

  const texto =
    `Olá ${conta.nome.split(" ")[0]},\n\n` +
    `Um administrador pediu uma palavra-passe nova para a tua conta.\n` +
    `A anterior deixou de funcionar.\n\n` +
    `Utilizador: ${conta.utilizador}\nPalavra-passe: ${palavraPasse}\n\n` +
    `Entra em ${endereco} e troca-a assim que entrares.\n\n` +
    `Se não foste tu que pediste, avisa já a equipa de recrutamento.\n\n` +
    `Equipa de Recrutamento - ${EMPRESA.nome}`;

  return enviarInterno(
    conta.email,
    "palavra_passe_reposta",
    `Palavra-passe nova para o painel | ${EMPRESA.nome}`,
    molde("Palavra-passe reposta", corpo, "#f59e0b"),
    texto,
    enviadoPor
  );
}

export async function testarLigacaoEmail(): Promise<{ ok: boolean; mensagem: string }> {
  try {
    await obterTransportador().verify();
    return { ok: true, mensagem: `SMTP autenticado como ${process.env.GMAIL_USER}.` };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}
