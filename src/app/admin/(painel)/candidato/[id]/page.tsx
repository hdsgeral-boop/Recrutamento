import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock,
  FolderOpen,
  Printer,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BotaoEstado, BotaoReprocessar, BotaoWhatsApp } from "@/components/accoes-candidato";
import {
  BotaoAgendar,
  BotaoDesmarcar,
  BotaoLembrete,
  BotaoMensagem,
  BotaoReenviarConfirmacao,
  BotaoReprovar,
} from "@/components/comunicar-candidato";
import { DocumentosCandidato } from "@/components/documentos-candidato";
import { PainelEntrevista } from "@/components/painel-entrevista";
import { lerRoteiroEmVigor } from "@/lib/entrevista/carregar-roteiro";
import { lerAtribuicao, podeEntrevistarCandidato } from "@/lib/entrevista/atribuicoes";
import { classificarExperiencia, CRITERIO_EXPERIENCIA } from "@/lib/entrevista/experiencia";
import { DEFINICOES_ESTADO, estadoVisivel } from "@/lib/entrevista/estados";
import { DEFINICOES_FASE } from "@/lib/constantes-fases";
import { dataHora as formatarDataHora } from "@/lib/datas";
import type { EventoCandidato } from "@/types/database";
import { HistoricoEmails } from "@/components/historico-emails";
import {
  BotaoReanalisar,
  DesdobramentoPontuacao,
  ListaAlertas,
} from "@/components/analise-candidato";
import { obterRubrica } from "@/lib/ranking/registo-rubricas";
import type { Alerta, ResultadoPontuacao } from "@/lib/ranking/tipos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { varianteDoEstado } from "@/lib/constantes";
import type { Candidato } from "@/types/database";
import { lerConfiguracaoFunil } from "@/lib/funil/carregar";
import { equipaDe } from "@/lib/entrevista/equipa";
import { DemografiaCandidato } from "@/components/demografia-candidato";
import { TentativasChamada } from "@/components/tentativas-chamada";
import { lerTentativas } from "@/app/admin/accoes-chamada";
import type { ModalidadeGravada } from "@/lib/entrevista/modalidade";

export const dynamic = "force-dynamic";

const dataHora = (iso: string | null) =>
  iso ? formatarDataHora(iso) : "-";

/** Linha "rótulo / valor" da ficha do candidato. */
function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-60 shrink-0 text-sm text-muted-foreground">{rotulo}</span>
      <span className="break-words text-sm font-medium">{valor}</span>
    </div>
  );
}

const SimNao = ({ v }: { v: boolean }) => (
  <span className={v ? "text-emerald-700" : "text-slate-500"}>{v ? "Sim" : "Não"}</span>
);

function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

const ESTADOS_ARQUIVO = {
  concluido: { icone: CheckCircle2, cor: "text-emerald-600", texto: "Arquivado no Google Drive" },
  pendente: { icone: Clock, cor: "text-amber-600", texto: "A arquivar no Google Drive…" },
  erro: { icone: CircleAlert, cor: "text-rose-600", texto: "Falhou o arquivamento no Drive" },
} as const;

/** O que este utilizador pode fazer nesta ficha. */
async function permissoes() {
  const { podeNaSessao } = await import("@/lib/utilizadores");
  const [editar, email, marcar, analisar] = await Promise.all([
    podeNaSessao("editar_candidatura"),
    podeNaSessao("enviar_email"),
    podeNaSessao("marcar_evento"),
    podeNaSessao("analisar"),
  ]);
  return { editar, email, marcar, analisar };
}

export default async function FichaCandidato({ params }: { params: { id: string } }) {
  const supabase = criarClienteServidor();

  const [{ data: registo }, { data: analiseData }, perm, { data: eventosData }, config, tentativas] = await Promise.all([
    supabase.from("candidatos").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("analises_candidato")
      .select("*")
      .eq("candidato_id", params.id)
      .eq("estado", "concluida")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
    permissoes(),
    supabase
      .from("eventos_candidato")
      .select("*")
      .eq("candidato_id", params.id)
      .order("quando", { ascending: false })
      .limit(20),
    lerConfiguracaoFunil(),
    lerTentativas(params.id),
  ]);

  // Os estados que a ficha oferece são os configurados em Definições.
  const nomesDosEstados = config.estados.filter((e) => e.activo).map((e) => e.nome);

  // O roteiro em vigor, as avaliações já feitas e a atribuição. Nenhum é
  // obrigatório: sem migração, o roteiro vem do código e as listas vêm
  // vazias, e a ficha do candidato continua a abrir na mesma.
  const [roteiro, { data: avaliacoesData }, atribuicao, autorizacao] = await Promise.all([
    lerRoteiroEmVigor(),
    supabase
      .from("avaliacoes_entrevista")
      .select("nota, versao_roteiro, criada_em, avaliador")
      .eq("candidato_id", params.id)
      .order("criada_em", { ascending: false })
      .limit(5),
    lerAtribuicao(params.id),
    podeEntrevistarCandidato(params.id),
  ]);

  if (!registo) notFound();

  const c = registo as Candidato;
  const analise = analiseData as
    | {
        pontuacao_total: number | null;
        pontuacao_detalhe: ResultadoPontuacao | null;
        alertas: Alerta[];
        eliminado: boolean;
        motivo_eliminacao: string | null;
        versao_rubrica: string;
      }
    | null;
  const arquivo = ESTADOS_ARQUIVO[c.arquivamento_estado] ?? ESTADOS_ARQUIVO.pendente;
  const IconeArquivo = arquivo.icone;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="no-print flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <ArrowLeft className="h-4 w-4" />
            Voltar à lista
          </Link>
        </Button>
        <Badge variant={varianteDoEstado(c.status)}>{c.status}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{c.nome}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Referência <span className="font-mono">{c.id.slice(0, 8).toUpperCase()}</span> ·
            candidatura de {dataHora(c.created_at)}
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="no-print flex flex-wrap gap-2">
            {perm.marcar && <BotaoAgendar candidato={c} />}
            {perm.email && <BotaoMensagem candidato={c} />}
            {perm.email && <BotaoReprovar candidato={c} />}
            {perm.editar && <BotaoEstado candidato={c} estados={nomesDosEstados} />}
            <BotaoWhatsApp candidato={c} />
            {c.drive_folder_url && (
              <Button asChild variant="outline" size="sm">
                <a href={c.drive_folder_url} target="_blank" rel="noopener noreferrer">
                  <FolderOpen className="h-4 w-4" />
                  Abrir pasta no Drive
                </a>
              </Button>
            )}
            {perm.editar && c.arquivamento_estado !== "concluido" && (
              <BotaoReprocessar id={c.id} />
            )}
          </div>

          <div className={`flex items-center gap-2 text-sm ${arquivo.cor}`}>
            <IconeArquivo className="h-4 w-4" />
            {arquivo.texto}
          </div>

          {c.arquivamento_erro && (
            <p className="rounded-lg bg-rose-50 p-3 font-mono text-xs text-rose-700">
              {c.arquivamento_erro}
            </p>
          )}

          <Separator />

          {/* ------------------------------------------------------- ANÁLISE */}
          <Seccao titulo="Análise da candidatura">
            <div className="mt-2 space-y-3">
              {analise ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Pontuação sugerida
                      </p>
                      <p className="text-3xl font-bold">
                        {analise.pontuacao_total}
                        <span className="text-base font-normal text-muted-foreground">
                          /{obterRubrica(analise.versao_rubrica).totalMaximo}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        rubrica {analise.versao_rubrica}
                      </p>
                    </div>
                    <div className="no-print">
                      {perm.analisar && <BotaoReanalisar id={c.id} />}
                    </div>
                  </div>

                  {analise.eliminado && (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                      <strong>Eliminado pela rubrica:</strong> {analise.motivo_eliminacao} A decisão
                      de o notificar é de quem decide, não do sistema.
                    </p>
                  )}

                  <ListaAlertas alertas={analise.alertas ?? []} />

                  {analise.pontuacao_detalhe && (
                    <DesdobramentoPontuacao detalhe={analise.pontuacao_detalhe} />
                  )}
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-slate-50 p-4">
                  <p className="text-sm text-muted-foreground">
                    Esta candidatura ainda não foi analisada.
                  </p>
                  <div className="no-print">
                    {perm.analisar && <BotaoReanalisar id={c.id} />}
                  </div>
                </div>
              )}
            </div>
          </Seccao>

          <Separator />

          {/* ---------------------------------------------------- ENTREVISTA */}
          <Seccao titulo="Entrevista">
            {c.entrevista_em ? (
              <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-700">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Marcada
                </p>
                <p className="mt-1 text-lg font-bold text-sky-900">
                  {formatarDataHora(c.entrevista_em)}
                </p>
                <p className="text-sm text-sky-800">{c.entrevista_local}</p>

                {/* Como se faz a entrevista, e - se for por telefone - em que
                    ponto vão as três tentativas. */}
                <div className="mt-3 border-t border-sky-200 pt-3">
                  <TentativasChamada
                    candidatoId={c.id}
                    modalidade={
                      ((c as { entrevista_modalidade?: string | null }).entrevista_modalidade ?? null) as ModalidadeGravada | null
                    }
                    link={(c as { entrevista_link?: string | null }).entrevista_link ?? null}
                    tentativasIniciais={Number((c as { chamada_tentativas?: number }).chamada_tentativas ?? 0)}
                    atendeuInicial={Boolean((c as { chamada_atendeu?: boolean }).chamada_atendeu)}
                    historico={tentativas}
                    podeRegistar={perm.marcar || perm.editar}
                  />
                </div>
                {c.entrevista_notas && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-sky-900/80">
                    {c.entrevista_notas}
                  </p>
                )}
                <div className="no-print mt-3 flex flex-wrap gap-1">
                  <BotaoLembrete id={c.id} />
                  <BotaoDesmarcar id={c.id} />
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed bg-slate-50 p-4">
                <p className="text-sm text-muted-foreground">
                  Sem entrevista marcada. Ao marcar, o candidato recebe email com a data e o local.
                </p>
                <div className="no-print">
                  <BotaoAgendar candidato={c} variante="outline" />
                </div>
              </div>
            )}
          </Seccao>

          {/* ------------------------------------------------ AVALIAÇÃO */}
          {/* Submódulo da Entrevista: a marcação diz QUANDO, isto diz COMO
              correu. Só aparece a quem pode marcar eventos. */}
          {autorizacao.pode ? (
            <div id="entrevista" className="no-print mt-4">
              <PainelEntrevista
                candidatoId={c.id}
                candidatoNome={c.nome}
                versao={roteiro.versao}
                perguntas={roteiro.perguntas}
                podeEnviarEmail={perm.email}
                fichaUrl={(c as { entrevista_drive_url?: string | null }).entrevista_drive_url ?? null}
                modalidade={
                  ((c as { entrevista_modalidade?: string | null }).entrevista_modalidade ?? null) as ModalidadeGravada | null
                }
                salaLink={(c as { entrevista_link?: string | null }).entrevista_link ?? null}
                telefone={c.telefone}
                jaAvaliado={(avaliacoesData ?? []).map(
                  (a: { nota: number; versao_roteiro: string; criada_em: string; avaliador: string | null }) => ({
                    nota: Number(a.nota),
                    versao: a.versao_roteiro,
                    quando: formatarDataHora(a.criada_em),
                    avaliador: a.avaliador,
                  })
                )}
                experiencia={classificarExperiencia({
                  manual: atribuicao?.grupo_manual ?? null,
                  criterio: (() => {
                    const c = analise?.pontuacao_detalhe?.criterios?.find(
                      (x: { codigo: string }) => x.codigo === CRITERIO_EXPERIENCIA
                    );
                    return c ? { pontos: c.pontos, maximo: c.maximo } : null;
                  })(),
                  declarou: c.experiencia_similar,
                })}
                quando={c.entrevista_em}
                duracaoMinutos={
                  (c as { entrevista_duracao_min?: number | null }).entrevista_duracao_min ?? null
                }
                iniciadaEm={atribuicao?.iniciada_em ?? null}
                concluidaEm={atribuicao?.concluida_em ?? null}
                entrevistaFechada={atribuicao?.estado === "concluida"}
              />
            </div>
          ) : (
            perm.marcar && (
              <div className="no-print mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="font-semibold text-amber-900">Não podes entrevistar este candidato</p>
                  <p className="mt-1 text-sm text-amber-800">{autorizacao.motivo}</p>
                  {atribuicao?.recrutador && (
                    <p className="mt-1 text-sm text-amber-800">
                      Está atribuído a <strong>{equipaDe(atribuicao).join(", ")}</strong>, no estado{" "}
                      {DEFINICOES_ESTADO[
                        estadoVisivel({
                          gravado: atribuicao.estado,
                          temData: Boolean(c.entrevista_em),
                          temAvaliacao: (avaliacoesData ?? []).length > 0,
                        })
                      ].rotulo.toLowerCase()}
                      .
                    </p>
                  )}
                </div>
              </div>
            )
          )}

          <Separator />

          {/* --------------------------------------------- FASES MARCADAS */}
          <Seccao titulo="Marcações">
            {(() => {
              const eventos = (eventosData ?? []) as EventoCandidato[];
              if (eventos.length === 0) {
                return (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ainda não há nada marcado para este candidato.
                  </p>
                );
              }

              return (
                <ul className="mt-2 space-y-2">
                  {eventos.map((e) => {
                    const d = DEFINICOES_FASE[e.fase];
                    return (
                      <li
                        key={e.id}
                        className="flex flex-wrap items-start gap-2 rounded-lg border bg-white p-3"
                      >
                        <span
                          className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${d.crachá}`}
                        >
                          {d.rotulo}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{formatarDataHora(e.quando)}</p>
                          <p className="text-xs text-muted-foreground">{e.local}</p>
                          {e.observacoes && (
                            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                              {e.observacoes}
                            </p>
                          )}
                        </div>
                        {!e.email_enviado && (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            sem email
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </Seccao>

          <Separator />

          {/* ---------------------------------------------------- DOCUMENTOS */}
          <Seccao titulo="Documentos anexados">
            <div className="mt-2">
              <DocumentosCandidato id={c.id} />
            </div>
          </Seccao>

          <Separator />

          <Seccao titulo="Identificação">
            <Campo rotulo="Nome completo" valor={c.nome} />
            <Campo rotulo="Nº do Bilhete de Identidade" valor={<span className="font-mono">{c.bi}</span>} />
            {/* Sexo e idade são lidos do BI e servem só para as contagens do
                Dashboard. Não entram na pontuação nem no ranking. */}
            <Campo
              rotulo="Sexo e idade"
              valor={
                <DemografiaCandidato
                  candidatoId={c.id}
                  sexo={(c as { sexo?: string | null }).sexo ?? null}
                  nascimento={(c as { data_nascimento?: string | null }).data_nascimento ?? null}
                  origem={(c as { demografia_origem?: string | null }).demografia_origem ?? null}
                  podeEditar={perm.editar}
                />
              }
            />
            <Campo rotulo="Província" valor={c.provincia} />
            <Campo rotulo="Município" valor={c.municipio} />
            <Campo
              rotulo="Telefone / WhatsApp"
              valor={
                <a href={`tel:+${c.telefone}`} className="hover:underline">
                  +{c.telefone}
                </a>
              }
            />
            <Campo
              rotulo="Email"
              valor={
                <a href={`mailto:${c.email}`} className="hover:underline">
                  {c.email}
                </a>
              }
            />
          </Seccao>

          <Seccao titulo="Formação e perfil">
            <Campo rotulo="Nível académico" valor={c.nivel_academico} />
            <Campo rotulo="Curso" valor={c.curso || "-"} />
            <Campo rotulo="Conhecimento MT/BT" valor={<SimNao v={c.conhece_mtbt} />} />
            <Campo rotulo="Carta de condução" valor={<SimNao v={c.tem_carta} />} />
            <Campo
              rotulo="Experiência em trabalhos similares"
              valor={
                <span className="flex flex-wrap items-center gap-2">
                  <SimNao v={c.experiencia_similar} />
                  {c.experiencia_similar &&
                    (c.experiencia_url ? (
                      <span className="text-xs text-emerald-700">comprovativo anexado</span>
                    ) : (
                      <span className="text-xs text-amber-700">sem comprovativo</span>
                    ))}
                </span>
              }
            />
            <Campo
              rotulo="Condições de trabalho"
              valor={
                c.condicoes_aceites ? (
                  <span className="text-emerald-700">Tomou conhecimento e confirmou</span>
                ) : (
                  <span className="text-amber-700">Sem confirmação registada</span>
                )
              }
            />
          </Seccao>

          <Seccao titulo="Emails enviados">
            <div className="mt-2 space-y-3">
              <HistoricoEmails candidatoId={c.id} />
              <div className="no-print">
                <BotaoReenviarConfirmacao id={c.id} />
              </div>
            </div>
          </Seccao>

          <Seccao titulo="Processo">
            <Campo rotulo="Estado" valor={<Badge variant={varianteDoEstado(c.status)}>{c.status}</Badge>} />
            <Campo rotulo="Candidatura recebida em" valor={dataHora(c.created_at)} />
            <Campo rotulo="Última alteração" valor={dataHora(c.updated_at)} />
            <Campo
              rotulo="Arquivamento"
              valor={<span className={arquivo.cor}>{arquivo.texto}</span>}
            />
            <Campo
              rotulo="Pasta no Google Drive"
              valor={
                c.drive_folder_url ? (
                  <a
                    href={c.drive_folder_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Abrir pasta
                  </a>
                ) : (
                  "-"
                )
              }
            />
            <Campo
              rotulo="Observações internas"
              valor={
                c.observacoes ? (
                  <span className="whitespace-pre-wrap">{c.observacoes}</span>
                ) : (
                  <span className="text-muted-foreground">Sem notas</span>
                )
              }
            />
          </Seccao>
        </CardContent>
      </Card>

      <p className="no-print flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Printer className="h-3.5 w-3.5" />
        Carrega em Ctrl+P (ou Cmd+P) para imprimir esta ficha.
      </p>
    </div>
  );
}
