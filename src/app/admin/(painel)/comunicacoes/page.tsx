import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Inbox,
  MailWarning,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BotaoLembrete } from "@/components/comunicar-candidato";
import { Paginacao } from "@/components/paginacao";
import { EmailsPorData } from "@/components/emails-por-data";
import { hojeEmAngola } from "@/lib/comunicacoes/por-data";
import { AgendaEntrevistas, type CandidatoDaAgenda } from "@/components/agenda-entrevistas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { carregarAnalises } from "@/lib/ranking/carregar";
import { podeNaSessao } from "@/lib/utilizadores";
import { dataHora, diasAte, porExtensoComDia } from "@/lib/datas";
import { DEFINICOES_FASE, type Fase } from "@/lib/constantes-fases";
import type { EventoCandidato } from "@/types/database";
import { fatiar, lerPaginacao } from "@/lib/paginacao";
import { CORES_EMAIL, ETIQUETAS_EMAIL } from "@/lib/constantes-email";
import { varianteDoEstado } from "@/lib/constantes";
import type { Candidato, EmailEnviado } from "@/types/database";

export const dynamic = "force-dynamic";




interface Props {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function Comunicacoes({ searchParams }: Props) {
  const supabase = criarClienteServidor();

  const [
    { data: emailsData, error: erroEmails },
    { data: entrevistasData, error: erroEntrevistas },
    { data: semEntrevista },
    { data: todosData },
    { data: eventosData, error: erroEventos },
    podeMarcar,
    podeEnviarEmail,
    { data: todosEventosData, error: erroTodosEventos },
  ] = await Promise.all([
      supabase.from("emails_enviados").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase
        .from("candidatos")
        .select("*")
        .not("entrevista_em", "is", null)
        .order("entrevista_em", { ascending: true }),
      supabase.from("candidatos").select("*").eq("status", "Aprovado").is("entrevista_em", null),
      supabase
        .from("candidatos")
        .select("id, nome, email, telefone, municipio, provincia, experiencia_similar, status")
        .order("nome", { ascending: true }),
      supabase
        .from("eventos_candidato")
        .select("*")
        .gte("quando", new Date(Date.now() - 86400000).toISOString())
        .order("quando", { ascending: true })
        .limit(500),
      podeNaSessao("marcar_evento"),
      podeNaSessao("enviar_email"),
      // O quadro das fases acima só quer o que está para vir. A listagem por
      // data também precisa do PASSADO: a pergunta «quem foi avisado para a
      // jornada da semana passada?» é a mais útil das duas.
      supabase
        .from("eventos_candidato")
        .select("candidato_id, fase, quando, local, criado_em")
        .order("quando", { ascending: false })
        .limit(3000),
    ]);

  // A agenda escolhe "os N melhores", por isso precisa da classificação.
  // Se as análises ainda não correram, a lista continua a aparecer - só sem
  // pontuação, e os atalhos do ranking ficam desligados.
  const { porCandidato: analises } = await carregarAnalises();

  // Se a migração das entrevistas ainda não foi corrida, dizemo-lo em vez de
  // deixar a página rebentar com um erro de coluna inexistente.
  const porMigrar = Boolean(erroEmails || erroEntrevistas);

  if (porMigrar) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">Comunicações</h1>
          <p className="text-sm text-muted-foreground">
            O que já foi dito a cada candidato, e as entrevistas que estão marcadas.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="font-semibold text-amber-900">Falta correr a migração no Supabase</p>
            <p className="mt-1 text-sm text-amber-800">
              Esta secção precisa da tabela <code className="break-all rounded bg-amber-100 px-1">emails_enviados</code>{" "}
              e das colunas da entrevista. Corre o ficheiro{" "}
              <code className="break-all rounded bg-amber-100 px-1">supabase/migracao-entrevistas.sql</code> no SQL
              Editor do Supabase e recarrega esta página.
            </p>
            <p className="mt-2 break-all font-mono text-xs text-amber-700">
              {(erroEmails ?? erroEntrevistas)?.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const emails = (emailsData ?? []) as EmailEnviado[];
  // Ordem da agenda: melhor classificado primeiro. Sem análise vai para o
  // fim, nunca para o meio, para não parecer que teve zero pontos.
  const paraMarcar: CandidatoDaAgenda[] = (todosData ?? [])
    .map((c: {
      id: string; nome: string; email: string; telefone: string;
      municipio: string; provincia: string | null;
      experiencia_similar: boolean | null; status: string;
    }) => {
      const a = analises.get(c.id);
      return {
        ...c,
        provincia: c.provincia ?? "",
        experienciaSimilar: c.experiencia_similar,
        pontuacao: a?.estado === "concluida" ? a.pontuacao_total : null,
        eliminado: Boolean(a?.eliminado),
        posicao: null as number | null,
      };
    })
    .sort((x, y) => {
      if (x.pontuacao === null && y.pontuacao === null) return x.nome.localeCompare(y.nome);
      if (x.pontuacao === null) return 1;
      if (y.pontuacao === null) return -1;
      return y.pontuacao - x.pontuacao || x.nome.localeCompare(y.nome);
    });

  // A posição só existe para quem tem pontuação. "1.º" de uma lista sem
  // análise não quer dizer nada.
  let lugar = 0;
  for (const c of paraMarcar) {
    if (c.pontuacao !== null && !c.eliminado) c.posicao = ++lugar;
  }

  // A tabela das fases pode ainda não existir, se a migração nova não correu.
  // A página continua a funcionar sem ela; só não mostra o quadro das fases.
  const eventos = (erroEventos ? [] : (eventosData ?? [])) as EventoCandidato[];
  const faltaMigracaoFases = Boolean(erroEventos);

  const eventosPorFase = new Map<Fase, EventoCandidato[]>();
  for (const e of eventos) {
    const lista = eventosPorFase.get(e.fase) ?? [];
    lista.push(e);
    eventosPorFase.set(e.fase, lista);
  }

  // ------------------------------------------- LISTAGEM DE EMAILS POR DATA
  const emailsParaLista = emails.map((e) => ({
    id: e.id,
    candidatoId: e.candidato_id,
    enviadoEm: e.created_at,
    tipo: e.tipo as string,
    destinatario: e.destinatario,
    assunto: e.assunto,
    estado: e.estado,
    erro: e.erro,
    enviadoPor: e.enviado_por,
  }));

  const eventosParaLista = (
    erroTodosEventos ? [] : (todosEventosData ?? [])
  ).map((e: { candidato_id: string; fase: string; quando: string; local: string | null; criado_em: string }) => ({
    candidatoId: e.candidato_id,
    fase: e.fase,
    quando: e.quando,
    criadoEm: e.criado_em,
    local: e.local,
  }));

  const nomePorId = new Map(paraMarcar.map((c) => [c.id, c.nome]));
  const entrevistas = (entrevistasData ?? []) as Candidato[];
  const porMarcar = (semEntrevista ?? []) as Candidato[];

  const agora = Date.now();
  const futuras = entrevistas.filter((c) => new Date(c.entrevista_em!).getTime() >= agora);
  const passadas = entrevistas.filter((c) => new Date(c.entrevista_em!).getTime() < agora);
  const falhados = emails.filter((e) => e.estado === "erro");

  // Os indicadores contam o histórico todo; a lista mostra só a página pedida.
  const fatia = lerPaginacao(searchParams, emails.length);
  const emailsDaPagina = fatiar(emails, fatia);

  // As entrevistas têm a sua própria paginação, com parâmetros próprios
  // (?entPagina=2), para mudar de página aqui não arrastar a lista dos emails.
  const fatiaEnt = lerPaginacao(searchParams, futuras.length, "ent");
  const futurasDaPagina = fatiar(futuras, fatiaEnt);

  const indicadores = [
    { rotulo: "Emails enviados", valor: emails.filter((e) => e.estado === "enviado").length, cor: "text-consulvolt-preto", icone: CheckCircle2 },
    { rotulo: "Envios falhados", valor: falhados.length, cor: falhados.length ? "text-rose-600" : "text-slate-400", icone: AlertCircle },
    { rotulo: "Entrevistas marcadas", valor: futuras.length, cor: "text-sky-600", icone: CalendarClock },
    { rotulo: "Aprovados sem entrevista", valor: porMarcar.length, cor: porMarcar.length ? "text-amber-600" : "text-slate-400", icone: Users },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Comunicações</h1>
        <p className="text-sm text-muted-foreground">
          O que já foi dito a cada candidato, e as entrevistas que estão marcadas.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {indicadores.map((i) => {
          const Icone = i.icone;
          return (
            <Card key={i.rotulo}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-2xl font-bold ${i.cor}`}>{i.valor}</p>
                  <Icone className={`h-4 w-4 ${i.cor}`} />
                </div>
                <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{i.rotulo}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ------------------------------------------------ MARCAÇÃO EM MASSA */}
      {/* ------------------------------------------------ AGENDA ---------- */}
      {/* Submódulo da marcação: a mesma gente, mas cada um com a sua hora. */}
      {podeMarcar && !faltaMigracaoFases && (
        <AgendaEntrevistas candidatos={paraMarcar} podeEnviarEmail={podeEnviarEmail} />
      )}

      {podeMarcar && faltaMigracaoFases && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="font-semibold text-amber-900">
              A agenda de entrevistas precisa de uma migração
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Corre{" "}
              <code className="break-all rounded bg-amber-100 px-1">
                supabase/migrations/20260906_utilizadores_e_fases.sql
              </code>{" "}
              no SQL Editor do Supabase e recarrega. Nada do que já existe é apagado.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ MARCAÇÕES POR FASE */}
      {eventos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Marcações por fase
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(DEFINICOES_FASE) as Fase[]).map((f) => {
              const lista = eventosPorFase.get(f) ?? [];
              const d = DEFINICOES_FASE[f];

              return (
                <div key={f} className="overflow-hidden rounded-xl border bg-white">
                  <div className="flex items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${d.crachá}`}>
                      {d.rotulo}
                    </span>
                    <span className="text-xs text-muted-foreground">{lista.length}</span>
                  </div>

                  {lista.length === 0 ? (
                    <p className="px-3 py-5 text-center text-xs text-muted-foreground">
                      Nada marcado.
                    </p>
                  ) : (
                    <ul className="max-h-56 divide-y overflow-y-auto">
                      {lista.map((e) => (
                        <li key={e.id} className="px-3 py-2">
                          <Link
                            href={`/admin/candidato/${e.candidato_id}`}
                            className="block truncate text-sm font-medium hover:text-consulvolt-vermelho hover:underline"
                          >
                            {nomePorId.get(e.candidato_id) ?? "Candidato"}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {dataHora(e.quando)} · {e.local}
                          </p>
                          {!e.email_enviado && (
                            <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                              sem email
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ------------------------------------------------ POR TRATAR */}
      {porMarcar.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <MailWarning className="h-4 w-4" />
            {porMarcar.length} aprovado(s) ainda sem entrevista marcada
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Estes candidatos foram aprovados mas não sabem quando é a entrevista.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {porMarcar.map((c) => (
              <Button key={c.id} asChild variant="outline" size="sm" className="bg-white">
                <Link href={`/admin/candidato/${c.id}`}>{c.nome}</Link>
              </Button>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------ ENTREVISTAS */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Próximas entrevistas
        </h2>

        {futuras.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
            Nenhuma entrevista marcada para os próximos dias.
          </p>
        ) : (
          <ul className="space-y-2">
            {futurasDaPagina.map((c) => {
              const dias = diasAte(c.entrevista_em!);
              return (
                <li key={c.id} className="rounded-xl border bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/candidato/${c.id}`}
                          className="font-medium hover:text-consulvolt-vermelho hover:underline"
                        >
                          {c.nome}
                        </Link>
                        <Badge variant={varianteDoEstado(c.status)}>{c.status}</Badge>
                        {dias <= 1 && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                            {dias <= 0 ? "hoje" : "amanhã"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-sky-700">
                        {porExtensoComDia(c.entrevista_em!)}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.entrevista_local}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        +{c.telefone} · {c.email}
                      </p>
                    </div>
                    <BotaoLembrete id={c.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {futuras.length > 0 && <Paginacao fatia={fatiaEnt} nome="entrevista" />}

        {passadas.length > 0 && (
          <details className="rounded-xl border bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {passadas.length} entrevista(s) já passada(s)
            </summary>
            <ul className="mt-3 space-y-1.5">
              {passadas.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={`/admin/candidato/${c.id}`}
                    className="font-medium hover:text-consulvolt-vermelho hover:underline"
                  >
                    {c.nome}
                  </Link>
                  <span className="text-muted-foreground">{dataHora(c.entrevista_em!)}</span>
                  <Badge variant={varianteDoEstado(c.status)}>{c.status}</Badge>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ------------------------------------------------ HISTÓRICO */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Últimos emails
        </h2>

        {emails.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-white py-12 text-center">
            <Inbox className="h-7 w-7 text-slate-300" />
            <p className="text-sm text-muted-foreground">Ainda não saiu nenhum email.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white">
            <ul className="divide-y">
              {emailsDaPagina.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CORES_EMAIL[e.tipo]}`}
                  >
                    {ETIQUETAS_EMAIL[e.tipo]}
                  </span>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/candidato/${e.candidato_id}`}
                      className="text-sm font-medium hover:text-consulvolt-vermelho hover:underline"
                    >
                      {e.assunto}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{e.destinatario}</p>
                    {e.erro && (
                      <p className="mt-1 font-mono text-[11px] text-rose-700">{e.erro.slice(0, 140)}</p>
                    )}
                  </div>

                  {e.estado === "enviado" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  )}
                  <span className="w-[92px] shrink-0 text-right text-xs text-muted-foreground">
                    {dataHora(e.created_at)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="px-3 pb-3">
              <Paginacao fatia={fatia} nome="email" />
            </div>
          </div>
        )}
      </section>

      {/* --------------------------------------- EMAILS POR DATA ---------- */}
      <EmailsPorData
        emails={emailsParaLista}
        eventos={eventosParaLista}
        nomePorCandidato={Object.fromEntries(nomePorId)}
        hoje={hojeEmAngola()}
      />
    </div>
  );
}
