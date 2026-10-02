"use server";

import { revalidatePath } from "next/cache";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { arquivarNoDrive } from "@/lib/google-drive";
import { enviarEmailAgradecimento } from "@/lib/email";
import { exigir } from "@/lib/utilizadores";
import { lerRoteiroEmVigor } from "@/lib/entrevista/carregar-roteiro";
import {
  perguntasDoCandidato,
  pontuarEntrevista,
  type Respostas,
} from "@/lib/entrevista/pontuacao";
import { grupoDoCandidato } from "@/lib/entrevista/grupo-servidor";
import { ESCALA, type Marcacao } from "@/lib/entrevista/roteiro";
import { dataHora } from "@/lib/datas";
import type { Candidato } from "@/types/database";

/**
 * ===========================================================================
 * GUARDAR UMA AVALIAÇÃO DE ENTREVISTA
 * ---------------------------------------------------------------------------
 * A ordem dos passos não é arbitrária. Primeiro grava-se a avaliação, que é o
 * que não se pode perder; só depois se tenta o Drive e o email, que podem
 * falhar por razões de fora (rede, quota, SMTP) sem que isso deva deitar
 * abaixo o trabalho do entrevistador.
 *
 * Por isso esta função devolve três estados separados - gravado, arquivado,
 * email enviado - em vez de um "ok" só. O painel mostra o que correu bem e o
 * que não correu, e o entrevistador sabe se tem de repetir alguma coisa.
 *
 * A NOTA É CALCULADA AQUI, NÃO RECEBIDA.
 * O ecrã mostra uma nota enquanto se marca, mas a que fica gravada é a que
 * este servidor calcula a partir das marcações. Um número vindo do browser
 * nunca é a fonte de verdade de uma avaliação.
 * ===========================================================================
 */

export interface PedidoAvaliacao {
  candidatoId: string;
  /** { "T1": "bom", "C3": "mau", ... } */
  respostas: Respostas;
  observacoes: string;
  recomendacao: "avancar" | "reserva" | "nao_avancar" | null;
  enviarAgradecimento: boolean;
  /** Veio do ecrã ou de uma ficha em papel lida por imagem. */
  origem?: "painel" | "ficha_papel";
  leituraBruta?: unknown;
  confianca?: number | null;
}

export interface ResultadoAvaliacao {
  ok: boolean;
  mensagem: string;
  nota?: number;
  incompleta?: boolean;
  versao?: string;
  arquivado: boolean;
  driveUrl?: string | null;
  emailEnviado: boolean;
  /** O que falhou depois da gravação, para o painel dizer a verdade. */
  avisos: string[];
}

export async function guardarAvaliacao(pedido: PedidoAvaliacao): Promise<ResultadoAvaliacao> {
  const falhar = (mensagem: string): ResultadoAvaliacao => ({
    ok: false,
    mensagem,
    arquivado: false,
    emailEnviado: false,
    avisos: [],
  });

  // ------------------------------------------------------------ PERMISSÕES
  let sessao;
  try {
    sessao = await exigir("marcar_evento");
    if (pedido.enviarAgradecimento) await exigir("enviar_email");
  } catch (erro) {
    return falhar(erro instanceof Error ? erro.message : "Sem permissão.");
  }

  const supabase = criarClienteServidor();

  const { data: dados, error: erroCandidato } = await supabase
    .from("candidatos")
    .select("*")
    .eq("id", pedido.candidatoId)
    .limit(1);

  const candidato = ((dados ?? [])[0] ?? null) as Candidato | null;
  if (erroCandidato || !candidato) return falhar("Candidato não encontrado.");

  // ------------------------------------------------------------- PONTUAR
  const roteiro = await lerRoteiroEmVigor();

  // Marcações de perguntas que já não existem no roteiro são ignoradas em vez
  // de contarem: pertencem a uma versão anterior e não têm peso nesta.
  const validas: Respostas = {};
  for (const p of roteiro.perguntas) {
    const m = pedido.respostas[p.codigo];
    if (m && m in ESCALA) validas[p.codigo] = m as Marcacao;
  }

  // Pontua-se contra O PERCURSO DESTE CANDIDATO, e não contra o roteiro
  // inteiro. Pôr no denominador as quatro perguntas do outro percurso, que
  // nunca lhe foram feitas, baixava a nota de toda a gente em vinte pontos.
  const grupo = await grupoDoCandidato(candidato);
  const doPercurso = perguntasDoCandidato(roteiro.perguntas, validas, grupo);
  const resultado = pontuarEntrevista(validas, doPercurso, roteiro.versao);

  if (resultado.respondidas === 0) {
    return falhar("Não marcaste nenhuma pergunta. Uma avaliação vazia não se guarda.");
  }

  // -------------------------------------------------------------- GRAVAR
  const { error } = await supabase.from("avaliacoes_entrevista").insert({
    candidato_id: candidato.id,
    versao_roteiro: roteiro.versao,
    avaliador: sessao.utilizador,
    respostas: validas,
    nota: resultado.nota,
    peso_respondido: resultado.pesoRespondido,
    incompleta: resultado.incompleta,
    origem: pedido.origem ?? "painel",
    leitura_bruta: pedido.leituraBruta ?? null,
    confianca: pedido.confianca ?? null,
    observacoes: pedido.observacoes.trim() || null,
    recomendacao: pedido.recomendacao,
  });

  if (error) {
    const falta = /relation .* does not exist|could not find the table/i.test(error.message);
    return falhar(
      falta
        ? "Falta correr a migração no Supabase. Cola o ficheiro supabase/CORRER-NO-SUPABASE.sql no SQL Editor."
        : error.message
    );
  }

  const avisos: string[] = [];
  let driveUrl: string | null = null;
  let emailEnviado = false;

  // ------------------------------------------------ A ENTREVISTA ACABOU
  // Guardar a avaliação É acabar a entrevista. Antes disto o processo ficava
  // aberto e o relógio do painel continuava a contar dias depois de a
  // avaliação estar gravada - que foi exactamente o que se viu no terreno.
  //
  // Carimba-se sem travar nada: a avaliação já está gravada, e é ela que não
  // se pode perder. Se este passo falhar, diz-se e segue-se.
  try {
    const { data: temAtribuicao } = await supabase
      .from("atribuicoes_entrevista")
      .select("id, concluida_em")
      .eq("candidato_id", candidato.id)
      .limit(1);

    const linha = (temAtribuicao ?? [])[0] as { id: string; concluida_em: string | null } | undefined;

    if (linha) {
      const fecho: Record<string, unknown> = {
        estado: "concluida",
        actualizada_em: new Date().toISOString(),
      };
      // Só se carimba a primeira vez. Guardar uma segunda avaliação não deve
      // esticar o tempo que a entrevista durou.
      if (!linha.concluida_em) {
        fecho.concluida_em = new Date().toISOString();
        fecho.concluida_por = sessao.utilizador;
      }

      const { error: erroFecho } = await supabase
        .from("atribuicoes_entrevista")
        .update(fecho)
        .eq("id", linha.id);

      if (erroFecho) {
        avisos.push(
          "A avaliação ficou gravada, mas não consegui fechar a entrevista no painel: " +
            erroFecho.message.slice(0, 120)
        );
      }
    }
  } catch (erro) {
    avisos.push(
      "A avaliação ficou gravada, mas não consegui fechar a entrevista no painel: " +
        (erro instanceof Error ? erro.message.slice(0, 120) : "erro desconhecido")
    );
  }

  // -------------------------------------------------------------- DRIVE
  // A ficha vai para a MESMA pasta do candidato onde estão os documentos, e
  // não para uma pasta de entrevistas à parte: quem abre a pasta de uma
  // pessoa quer ver tudo o que há sobre ela, sem andar a saltar de sítio.
  try {
    const ficha = fichaEmHtml(candidato, doPercurso, validas, resultado, {
      avaliador: sessao.nome || sessao.utilizador,
      observacoes: pedido.observacoes.trim(),
      recomendacao: pedido.recomendacao,
    });

    const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const r = await arquivarNoDrive(candidato.nome, candidato.bi, [
      {
        nome: `Entrevista_${carimbo}_${roteiro.versao}.html`,
        tipo: "text/html; charset=utf-8",
        conteudo: Buffer.from(ficha, "utf-8"),
      },
    ]);

    driveUrl = r.ficheiros[0]?.url ?? r.pastaUrl;
    await supabase
      .from("candidatos")
      .update({ entrevista_drive_url: driveUrl })
      .eq("id", candidato.id);
  } catch (erro) {
    avisos.push(
      `A avaliação ficou gravada, mas não subiu para o Drive: ${
        erro instanceof Error ? erro.message.slice(0, 120) : "erro desconhecido"
      }`
    );
  }

  // -------------------------------------------------------------- EMAIL
  if (pedido.enviarAgradecimento) {
    try {
      const r = await enviarEmailAgradecimento(candidato, null, sessao.utilizador);
      if (r.ok) emailEnviado = true;
      else avisos.push(`O email de agradecimento não saiu: ${(r.erro ?? "").slice(0, 120)}`);
    } catch (erro) {
      avisos.push(
        `O email de agradecimento não saiu: ${
          erro instanceof Error ? erro.message.slice(0, 120) : "erro desconhecido"
        }`
      );
    }
  }

  revalidatePath(`/admin/candidato/${candidato.id}`);
  revalidatePath("/admin");
  revalidatePath("/admin/entrevistas");

  return {
    ok: true,
    nota: resultado.nota,
    incompleta: resultado.incompleta,
    versao: roteiro.versao,
    arquivado: driveUrl !== null,
    driveUrl,
    emailEnviado,
    avisos,
    mensagem: `Avaliação guardada: ${resultado.nota} em 100${
      resultado.incompleta ? " (entrevista incompleta)" : ""
    }.`,
  };
}

// ---------------------------------------------------------------------------
// A FICHA QUE FICA NO DRIVE
// ---------------------------------------------------------------------------

/**
 * HTML simples e fechado em si mesmo, sem imagens nem folhas de estilo de
 * fora. Abre no browser de qualquer pessoa daqui a cinco anos, e imprime-se
 * em papel sem perder nada. Guardar um PDF gerado no servidor obrigava a uma
 * biblioteca a mais, e o que interessa é o conteúdo estar legível e completo.
 */
function fichaEmHtml(
  c: Candidato,
  perguntas: { codigo: string; bloco: string; pergunta: string; peso: number }[],
  respostas: Respostas,
  r: { nota: number; pesoRespondido: number; incompleta: boolean; versao: string },
  extra: { avaliador: string; observacoes: string; recomendacao: string | null }
): string {
  const seguro = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const RECOMENDACOES: Record<string, string> = {
    avancar: "Avançar",
    reserva: "Reserva",
    nao_avancar: "Não avançar",
  };

  const linhas = perguntas
    .map((p) => {
      const m = respostas[p.codigo];
      const marcado = m ? ESCALA[m].rotulo : "nao perguntada";
      const pontos = m ? p.peso * ESCALA[m].fraccao : 0;
      return `<tr>
        <td class="c">${seguro(p.codigo)}</td>
        <td>${seguro(p.pergunta)}</td>
        <td class="n">${p.peso}</td>
        <td class="m ${m ?? "vazio"}">${seguro(marcado)}</td>
        <td class="n">${m ? pontos : "-"}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-PT"><head><meta charset="utf-8">
<title>Entrevista - ${seguro(c.nome)}</title>
<style>
 body{font:14px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#16181d;max-width:820px;margin:28px auto;padding:0 18px}
 h1{font-size:19px;margin:0 0 4px} .sub{color:#5b6472;font-size:13px;margin:0 0 20px}
 .nota{font-size:34px;font-weight:700;color:#16a34a}
 .caixa{border:1px solid #e3e7ec;border-radius:10px;padding:14px 16px;margin:0 0 18px}
 table{width:100%;border-collapse:collapse;font-size:13px;margin:0 0 18px}
 th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5b6472;padding:0 6px 6px}
 td{border-top:1px solid #e3e7ec;padding:7px 6px;vertical-align:top}
 td.c{font-family:ui-monospace,Menlo,monospace;font-weight:600;white-space:nowrap}
 td.n{text-align:right;white-space:nowrap}
 td.m{font-weight:600;white-space:nowrap}
 td.m.bom{color:#15803d} td.m.razoavel{color:#b45309} td.m.mau{color:#be123c} td.m.vazio{color:#94a3b8;font-weight:400}
 .obs{white-space:pre-wrap}
 footer{border-top:1px solid #e3e7ec;margin-top:24px;padding-top:12px;color:#5b6472;font-size:12px}
</style></head><body>
<h1>Ficha de Entrevista - ${seguro(c.nome)}</h1>
<p class="sub">BI ${seguro(c.bi)} &middot; ${seguro(c.municipio)} &middot; ${seguro(c.email)}</p>

<div class="caixa">
  <span class="nota">${r.nota}</span> em 100
  <div style="color:#5b6472;font-size:13px;margin-top:4px">
    Roteiro ${seguro(r.versao)} &middot; pontuada sobre ${r.pesoRespondido} pontos perguntados
    ${r.incompleta ? " &middot; <strong>entrevista incompleta</strong>" : ""}
  </div>
</div>

<table>
  <thead><tr><th>Cod.</th><th>Pergunta</th><th style="text-align:right">Peso</th><th>Marcacao</th><th style="text-align:right">Pontos</th></tr></thead>
  <tbody>${linhas}</tbody>
</table>

${
  extra.observacoes
    ? `<div class="caixa"><strong>Observações do entrevistador</strong><div class="obs">${seguro(extra.observacoes)}</div></div>`
    : ""
}
${
  extra.recomendacao
    ? `<div class="caixa"><strong>Recomendação:</strong> ${seguro(RECOMENDACOES[extra.recomendacao] ?? extra.recomendacao)}</div>`
    : ""
}

<footer>
  Entrevistador: ${seguro(extra.avaliador)} &middot; guardado em ${seguro(dataHora(new Date().toISOString()))} (hora de Angola).<br>
  A nota da entrevista é ordenação sugerida, não é aprovação nem rejeição.
</footer>
</body></html>`;
}
