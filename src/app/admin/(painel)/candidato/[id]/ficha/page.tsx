import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { DescarregarFicha } from "@/components/descarregar-ficha";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { lerRoteiroEmVigor, lerRoteiroDaVersao } from "@/lib/entrevista/carregar-roteiro";
import { equipaDe } from "@/lib/entrevista/equipa";
import { podeEntrevistarCandidato, lerAtribuicao } from "@/lib/entrevista/atribuicoes";
import {
  classificarExperiencia,
  CRITERIO_EXPERIENCIA,
  NOME_GRUPO,
  perguntaServe,
} from "@/lib/entrevista/experiencia";
import { pontuarEntrevista, escalaoDaNota, type Respostas } from "@/lib/entrevista/pontuacao";
import { ESCALA, MARCACOES, NOME_BLOCO, type Bloco, type Pergunta } from "@/lib/entrevista/roteiro";
import { dataHora, porExtenso } from "@/lib/datas";
import { EMPRESA } from "@/lib/constantes";
import type { Candidato } from "@/types/database";

export const dynamic = "force-dynamic";

/**
 * ===========================================================================
 * A FICHA DE ENTREVISTA
 * ---------------------------------------------------------------------------
 * A mesma página serve as duas coisas que a equipa precisa:
 *
 *   EM BRANCO, para levar para a sala e preencher à caneta. Bolas para
 *   preencher, âncoras nos cantos para endireitar a fotografia, e o id do
 *   candidato impresso, porque uma pilha de vinte fichas preenchidas sem
 *   identificação é uma pilha de papéis sem dono.
 *
 *   PREENCHIDA (?avaliacao=1), depois de guardada: as marcações, os pontos de
 *   cada pergunta, o resultado e as observações. É o documento que fica no
 *   processo.
 *
 * COMO SE OBTÉM O PDF
 * Pelo Imprimir do browser, com "Guardar como PDF". Não há gerador de PDF no
 * servidor de propósito: um Chromium headless não cabe numa função da Vercel
 * no plano Hobby, e as bibliotecas que cabem obrigam a desenhar o documento a
 * coordenadas, o que dá pior resultado do que esta página com estilos de
 * impressão. A página está desenhada para A4 e sai igual em qualquer browser.
 * ===========================================================================
 */

/**
 * A bola de uma opção: vazia para preencher à caneta, cheia quando já foi
 * marcada no painel.
 *
 * DESENHADA EM SVG, E NÃO COM UM FUNDO.
 * Uma bola preenchida com `background` depende de o browser aceitar imprimir
 * fundos - e por omissão ele NÃO aceita. O resultado era uma ficha que no
 * ecrã mostrava as marcações e no papel saía com todas as bolas vazias. O
 * traço e o preenchimento de um SVG são conteúdo, não decoração: saem sempre.
 *
 * A folha de impressão também força `print-color-adjust: exact`. As duas
 * coisas juntas de propósito: uma regra de CSS que alguém apague sem reparar
 * não pode voltar a esvaziar as marcações de uma avaliação.
 */
function Bola({ marcada }: { marcada?: boolean }) {
  return (
    <svg
      className="mx-auto block"
      width={19}
      height={19}
      viewBox="0 0 19 19"
      aria-hidden
      focusable="false"
    >
      <circle cx="9.5" cy="9.5" r="8" fill="#ffffff" stroke="#000000" strokeWidth="2" />
      {marcada && <circle cx="9.5" cy="9.5" r="5.5" fill="#000000" />}
    </svg>
  );
}

/**
 * Um quadrado preto cheio: as âncoras de canto e as barras do código.
 *
 * Mesma razão da bola. Estes são os pontos que a leitura por fotografia usa
 * para endireitar a folha e para saber de quem ela é; se não saírem no papel,
 * a folha impressa deixa de poder ser lida por imagem.
 */
function Marca({ largura, altura, className }: { largura: number; altura: number; className?: string }) {
  return (
    <svg
      className={className}
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      aria-hidden
      focusable="false"
    >
      <rect x="0" y="0" width={largura} height={altura} fill="#000000" />
    </svg>
  );
}

interface Props {
  params: { id: string };
  searchParams: { avaliacao?: string };
}

export default async function FichaDeEntrevista({ params, searchParams }: Props) {
  // A ficha traz dados do candidato e serve para o entrevistar: exige
  // exactamente o mesmo que a entrevista no ecrã. Sem isto, imprimir era uma
  // porta lateral para ver a ficha de um candidato de outro recrutador.
  //
  // Recusa-se com uma página explicada, e não com um erro 500. Um recrutador
  // que carregue no link errado merece saber porquê, não um ecrã partido.
  const autorizacao = await podeEntrevistarCandidato(params.id);
  if (!autorizacao.pode) return <SemAcesso motivo={autorizacao.motivo} />;

  const supabase = criarClienteServidor();
  const preenchida = searchParams.avaliacao === "1";

  const [{ data: registo }, roteiroEmVigor, atribuicao, { data: analiseData }, { data: avaliacoesData }] =
    await Promise.all([
      supabase.from("candidatos").select("*").eq("id", params.id).maybeSingle(),
      lerRoteiroEmVigor(),
      lerAtribuicao(params.id),
      supabase
        .from("analises_candidato")
        .select("pontuacao_detalhe")
        .eq("candidato_id", params.id)
        .eq("estado", "concluida")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("avaliacoes_entrevista")
        .select("*")
        .eq("candidato_id", params.id)
        .order("criada_em", { ascending: false })
        .limit(1),
    ]);

  const c = registo as Candidato | null;
  if (!c) notFound();

  const avaliacao = preenchida
    ? ((avaliacoesData ?? [])[0] as
        | {
            respostas: Respostas;
            nota: number;
            versao_roteiro: string;
            avaliador: string | null;
            observacoes: string | null;
            recomendacao: string | null;
            criada_em: string;
            incompleta: boolean;
          }
        | undefined)
    : undefined;

  // Uma ficha preenchida usa as perguntas DA VERSÃO COM QUE FOI FEITA, e não
  // as de hoje. Imprimir a avaliação de Março com o roteiro de Setembro
  // mostrava respostas encostadas a perguntas que nunca foram feitas.
  const perguntasDaVersao = avaliacao
    ? (await lerRoteiroDaVersao(avaliacao.versao_roteiro)) ?? roteiroEmVigor.perguntas
    : roteiroEmVigor.perguntas;

  const versao = avaliacao?.versao_roteiro ?? roteiroEmVigor.versao;

  const criterio = (
    analiseData as { pontuacao_detalhe?: { criterios?: { codigo: string; pontos: number; maximo: number }[] } } | null
  )?.pontuacao_detalhe?.criterios?.find((x) => x.codigo === CRITERIO_EXPERIENCIA);

  const experiencia = classificarExperiencia({
    manual: atribuicao?.grupo_manual ?? null,
    criterio: criterio ? { pontos: criterio.pontos, maximo: criterio.maximo } : null,
    declarou: c.experiencia_similar,
  });

  // Numa ficha preenchida, as perguntas são as que foram mesmo respondidas.
  const respostas = avaliacao?.respostas ?? {};
  const perguntas = avaliacao
    ? perguntasDaVersao.filter((p) => respostas[p.codigo] !== undefined || perguntaServe(p.grupo, experiencia.grupo))
    : perguntasDaVersao.filter((p) => perguntaServe(p.grupo, experiencia.grupo));

  // O recálculo serve para os pontos de CADA pergunta. A nota que a ficha
  // mostra é a que ficou GRAVADA: é essa que é o registo, e é com essa que o
  // candidato foi ordenado. Recalcular e mostrar outro número transformava a
  // ficha impressa numa segunda versão da verdade.
  //
  // As duas só podem divergir se alguém tiver mexido na base à mão, porque as
  // versões do roteiro não se alteram. Se divergirem, a ficha diz - esconder
  // era o pior dos dois mundos.
  const recalculo = avaliacao ? pontuarEntrevista(respostas, perguntas, versao) : null;
  const notaGravada = avaliacao ? Math.round(Number(avaliacao.nota)) : null;
  const divergente = recalculo !== null && notaGravada !== null && recalculo.nota !== notaGravada;

  const blocos = new Map<Bloco, Pergunta[]>();
  for (const p of perguntas) {
    const lista = blocos.get(p.bloco) ?? [];
    lista.push(p);
    blocos.set(p.bloco, lista);
  }

  const RECOMENDACOES: Record<string, string> = {
    avancar: "Avançar",
    reserva: "Reserva",
    nao_avancar: "Não avançar",
  };

  return (
    <div className="mx-auto max-w-[840px] bg-white text-black">
      {/* ------------------------------------------------------- BARRA ---- */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-slate-50 p-3 text-xs">
        <span className="flex-1 text-slate-600">
          {avaliacao ? (
            <>
              Ficha preenchida, pronta a arquivar. Depois da entrevista a ficha sai em{" "}
              <strong>imagem</strong>: é um registo do que aconteceu, e abre em qualquer
              telemóvel sem precisar de nada.
            </>
          ) : (
            <>
              {preenchida
                ? "Esta entrevista ainda não tem avaliação guardada."
                : "Ficha em branco, para preencher à caneta na sala."}{" "}
              Antes e durante a entrevista sai em <strong>PDF</strong>, que é o que uma
              impressora entende. Em Imprimir, escolhe <strong>Guardar como PDF</strong>.
            </>
          )}
        </span>

        <a
          href={`/admin/candidato/${params.id}/ficha${preenchida ? "" : "?avaliacao=1"}`}
          className="rounded-md border bg-white px-2.5 py-1.5 font-medium transition-colors hover:border-slate-400"
        >
          {preenchida ? "Ver em branco" : "Ver preenchida"}
        </a>

        {/* A entrevista já aconteceu quando há avaliação gravada - e é isso, e
            não o endereço da página, que decide o formato. Abrir a ficha
            preenchida de alguém que ainda não foi entrevistado não pode dar
            uma imagem de um registo que não existe. */}
        <DescarregarFicha
          preenchida={Boolean(avaliacao)}
          nome={c.nome}
          referencia={c.id.slice(0, 8)}
        />
      </div>

      {preenchida && !avaliacao && (
        <p className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Este candidato ainda não tem avaliação guardada. Esta ficha está em branco.
        </p>
      )}

      {/* ------------------------------------------------------ A FOLHA --- */}
      <div id="folha-ficha" className="relative border border-slate-200 p-5 print:border-0">
        {/* Âncoras de canto: quatro pontos conhecidos deixam corrigir a
            perspectiva de uma folha fotografada em cima da mesa. */}
        <Marca largura={13} altura={13} className="absolute left-2 top-2" />
        <Marca largura={13} altura={13} className="absolute right-2 top-2" />
        <Marca largura={13} altura={13} className="absolute bottom-2 left-2" />
        <Marca largura={13} altura={13} className="absolute bottom-2 right-2" />

        {/* ------------------------------------------------- CABEÇALHO ---- */}
        <header className="mb-4 flex items-start justify-between gap-4 border-b-[3px] border-black px-3 pb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg ring-1 ring-slate-300">
              <Image
                src="/logo-consulvolt.png"
                alt={`Logótipo da ${EMPRESA.nome}`}
                width={52}
                height={52}
                className="h-full w-full object-contain p-1"
              />
            </span>
            <div className="leading-tight">
              <p className="text-[17px] font-black tracking-widest">{EMPRESA.nome}</p>
              <p className="text-[10px] text-slate-600">{EMPRESA.nomeCompleto}</p>
              <p className="text-[10px] text-slate-600">{EMPRESA.morada}</p>
            </div>
          </div>

          <div className="text-right">
            <h1 className="text-[15px] font-bold uppercase tracking-wide">Ficha de Entrevista</h1>
            <p className="font-mono text-[10px] text-slate-600">
              roteiro {versao} · ref. {c.id.slice(0, 8)}
            </p>
            {/* Padrão ligado ao id, para a leitura por imagem saber de quem é
                a folha sem depender de quem a preencheu escrever o nome. */}
            <div className="mt-1.5 flex h-[24px] items-stretch justify-end gap-[1.5px]">
              {c.id
                .replace(/-/g, "")
                .slice(0, 20)
                .split("")
                .map((ch, i) => (
                  <Marca
                    key={i}
                    largura={1 + (parseInt(ch, 16) % 4)}
                    altura={24}
                    className="block shrink-0"
                  />
                ))}
            </div>
          </div>
        </header>

        {/* ----------------------------------------------- IDENTIFICAÇÃO -- */}
        <section className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1.5 px-3 text-[12px]">
          <Campo rotulo="Recrutamento" valor={EMPRESA.projecto} />
          <Campo rotulo="Vaga" valor={EMPRESA.vaga} />
          <Campo rotulo="Candidato" valor={`${c.nome} · BI ${c.bi}`} />
          <Campo
            rotulo="Grupo"
            valor={
              experiencia.grupo === "indeterminado"
                ? "Por decidir - só perguntas comuns"
                : NOME_GRUPO[experiencia.grupo]
            }
          />
          <Campo
            rotulo="Data da entrevista"
            valor={
              avaliacao
                ? porExtenso(avaliacao.criada_em)
                : c.entrevista_em
                  ? porExtenso(c.entrevista_em)
                  : "____ / ____ / ________"
            }
          />
          <Campo
            rotulo="Recrutador"
            valor={avaliacao?.avaliador ?? (equipaDe(atribuicao).join(", ") || "_____________________")}
          />
        </section>

        {/* -------------------------------------------------- PERGUNTAS --- */}
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th />
              <th />
              {MARCACOES.map((m) => (
                <th
                  key={m}
                  className="w-[54px] pb-1.5 text-center text-[9.5px] font-semibold uppercase tracking-wide text-slate-600"
                >
                  {ESCALA[m].rotulo}
                </th>
              ))}
              {avaliacao && (
                <th className="w-[48px] pb-1.5 text-right text-[9.5px] font-semibold uppercase tracking-wide text-slate-600">
                  Pontos
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {[...blocos.entries()].map(([bloco, lista]) => (
              <>
                <tr key={bloco} className="bg-slate-100">
                  <td
                    colSpan={2 + MARCACOES.length + (avaliacao ? 1 : 0)}
                    className="px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-600"
                  >
                    {NOME_BLOCO[bloco]} - {lista.reduce((s, p) => s + p.peso, 0)} pontos
                  </td>
                </tr>
                {lista.map((p) => {
                  const marcada = respostas[p.codigo];
                  return (
                    <tr key={p.codigo} className="border-t border-slate-300">
                      <td className="whitespace-nowrap py-2 pl-3 pr-2 align-top font-mono text-[11px] font-semibold">
                        {p.codigo}
                      </td>
                      <td className="py-2 pr-2">
                        {p.pergunta}
                        <span className="ml-1.5 text-[10px] text-slate-500">{p.peso} pts</span>
                      </td>
                      {MARCACOES.map((m) => (
                        <td key={m} className="py-2 text-center align-middle">
                          <Bola marcada={marcada === m} />
                        </td>
                      ))}
                      {avaliacao && (
                        <td className="py-2 pr-3 text-right align-middle font-mono text-[11px] tabular-nums">
                          {marcada ? p.peso * ESCALA[marcada].fraccao : "-"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>

        {/* --------------------------------------------------- RESULTADO -- */}
        <section className="mt-4 px-3">
          <div className="flex flex-wrap items-center gap-3 border-y-2 border-black py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Resultado da entrevista
            </span>
            {notaGravada !== null && recalculo ? (
              <>
                <span className="text-[26px] font-black leading-none">{notaGravada}</span>
                <span className="text-[11px] text-slate-600">
                  em 100 · {escalaoDaNota(notaGravada).rotulo} · pontuado sobre{" "}
                  {recalculo.pesoRespondido} pontos perguntados
                  {avaliacao?.incompleta && " · entrevista incompleta"}
                </span>
              </>
            ) : (
              <span className="text-[12px] text-slate-500">__________ / 100</span>
            )}

            {avaliacao?.recomendacao && (
              <span className="ml-auto rounded border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                {RECOMENDACOES[avaliacao.recomendacao] ?? avaliacao.recomendacao}
              </span>
            )}
            {!avaliacao && (
              <span className="ml-auto text-[11px] text-slate-600">
                Recomendação: avançar / reserva / não avançar
              </span>
            )}
          </div>

          {divergente && (
            <p className="mt-2 rounded border border-rose-300 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-900">
              A nota gravada ({notaGravada}) não bate certo com a soma das marcações desta ficha
              ({recalculo!.nota}). Vale a gravada, que foi a que ordenou o candidato. Convém
              perceber porquê antes de arquivar.
            </p>
          )}

          <div className="mt-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Observações (não pontuam)
            </p>
            {avaliacao?.observacoes ? (
              <p className="whitespace-pre-wrap rounded border border-slate-300 p-2 text-[12px]">
                {avaliacao.observacoes}
              </p>
            ) : (
              <div className="h-[54px] rounded border border-slate-300" />
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-6">
            <div className="flex-1 basis-[200px] border-t border-black pt-1 text-[11px] text-slate-600">
              Assinatura do entrevistador
              {avaliacao?.avaliador && (
                <span className="block text-[10px]">{avaliacao.avaliador}</span>
              )}
            </div>
            <div className="flex-1 basis-[200px] border-t border-black pt-1 text-[11px] text-slate-600">
              Data
              {avaliacao && <span className="block text-[10px]">{dataHora(avaliacao.criada_em)}</span>}
            </div>
          </div>

          <p className="mt-3 text-[9.5px] leading-snug text-slate-500">
            {avaliacao
              ? "A nota da entrevista é ordenação sugerida, não é aprovação nem rejeição."
              : "Preenche a bola por completo, à esferográfica azul ou preta. Uma pergunta que não chegaste a fazer deixa-se em branco - não é um Mau, e sai do total."}
          </p>
        </section>
      </div>
    </div>
  );
}

function SemAcesso({ motivo }: { motivo: string | null }) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="font-semibold text-amber-900">Esta ficha não é tua</p>
          <p className="mt-1 text-sm text-amber-800">
            {motivo ?? "Não tens permissão para abrir a ficha deste candidato."}
          </p>
          <Link
            href="/admin/entrevistas"
            className="mt-3 inline-block text-sm font-medium text-amber-900 underline"
          >
            Ver as entrevistas que te foram atribuídas
          </Link>
        </div>
      </div>
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p className="flex gap-1.5">
      <span className="shrink-0 font-semibold text-slate-600">{rotulo}:</span>
      <span className="min-w-0 flex-1 border-b border-dotted border-slate-400">{valor}</span>
    </p>
  );
}
