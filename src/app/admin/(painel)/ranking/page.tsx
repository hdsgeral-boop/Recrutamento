import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  Car,
  Info,
  MapPin,
  ScrollText,
  Sparkles,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BotaoAnalisarTodos } from "@/components/botao-analisar-todos";
import { Dica } from "@/components/dica";
import { LegendaRanking } from "@/components/legenda-ranking";
import { Paginacao } from "@/components/paginacao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { carregarAnalises, type AnaliseDoPainel } from "@/lib/ranking/carregar";
import { fatiar, lerPaginacao } from "@/lib/paginacao";
import { obterRubrica } from "@/lib/ranking/registo-rubricas";
import { versaoMotor } from "@/lib/analise/versao";
import { escalaoDaNota } from "@/lib/entrevista/pontuacao";
import {
  BARRAS,
  contarAlertas,
  DESCRICAO_ALERTA,
  escalaoDe,
  GRAVIDADES,
  valorDaBarra,
} from "@/lib/ranking/apresentacao";
import { varianteDoEstado } from "@/lib/constantes";
import { lerDefinicoes } from "@/lib/definicoes";
import type { ResultadoPontuacao } from "@/lib/ranking/tipos";
import type { Candidato } from "@/types/database";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: {
    provincia?: string;
    municipio?: string;
    escalao?: string;
    alertas?: string;
    pagina?: string;
    porPagina?: string;
  };
}

// --------------------------------------------------------------- PEDACINHOS

/** Uma barra com o seu próprio pop-up explicativo. */
function BarraComDica({
  detalhe,
  indice,
}: {
  detalhe: ResultadoPontuacao;
  indice: number;
}) {
  const barra = BARRAS[indice];
  const valor = valorDaBarra(detalhe, barra);
  const bandas = barra.criterios
    .map((c) => detalhe.criterios.find((x) => x.codigo === c))
    .filter(Boolean);

  return (
    <Dica
      titulo={`${barra.rotulo}: ${valor} de ${barra.maximo}`}
      conteudo={
        <div className="space-y-2">
          <p className="text-slate-300">{barra.descricao}</p>
          <ul className="space-y-1 border-t border-slate-700 pt-2">
            {bandas.map((c) => (
              <li key={c!.codigo} className="flex justify-between gap-3">
                <span className="text-slate-300">{c!.nome}</span>
                <span className="shrink-0 font-mono">
                  {c!.pontos}/{c!.maximo}
                </span>
              </li>
            ))}
          </ul>
          {bandas[0]?.evidencia && (
            <p className="border-t border-slate-700 pt-2 italic text-slate-400">
              &ldquo;{bandas[0].evidencia}&rdquo;
            </p>
          )}
        </div>
      }
    >
      <span className="block w-full">
        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <span
            className={`block h-full rounded-full ${barra.cor}`}
            style={{ width: `${Math.round((valor / barra.maximo) * 100)}%` }}
          />
        </span>
      </span>
    </Dica>
  );
}

// -------------------------------------------------------------------- VISTA

import { obterConcursoActivo } from "@/app/admin/accoes-concursos";

export default async function Ranking({ searchParams }: Props) {
  const supabase = criarClienteServidor();
  const concursoActivo = await obterConcursoActivo();

  let consultaCandidatos = supabase.from("candidatos").select("*").order("created_at", { ascending: false });
  if (concursoActivo?.id) {
    consultaCandidatos = consultaCandidatos.eq("concurso_id", concursoActivo.id);
  }

  const [{ data: candidatosData }, { porCandidato: analises, erro: erroAnalises }, definicoes] =
    await Promise.all([
      consultaCandidatos,
      carregarAnalises(),
      lerDefinicoes(concursoActivo?.slug),
    ]);

  const rubrica = obterRubrica(definicoes.rubricaVersao || "padrao-v1");
  const totalMaximo = rubrica.totalMaximo;
  const municipiosProjecto = rubrica.municipiosProjecto || [];

  if (erroAnalises) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Ranking</h1>
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="font-semibold text-amber-900">Falta correr a migração no Supabase</p>
            <p className="mt-1 text-sm text-amber-800">
              Corre{" "}
              <code className="break-all rounded bg-amber-100 px-1">
                supabase/migrations/20260902_ranking_analitico.sql
              </code>{" "}
              no SQL Editor e recarrega.
            </p>
            <p className="mt-2 break-all font-mono text-xs text-amber-700">{erroAnalises.message}</p>
          </div>
        </div>
      </div>
    );
  }

  const candidatos = (candidatosData ?? []) as Candidato[];

  // ------------------------------------------------- NOTAS DA ENTREVISTA
  // Vêm do módulo de entrevistas, não são recalculadas nem copiadas para
  // aqui. Se a tabela ainda não existir, a coluna fica vazia e o ranking
  // funciona na mesma - a pontuação da candidatura não depende disto.
  const { data: avaliacoesData } = await supabase
    .from("avaliacoes_entrevista")
    .select("candidato_id, nota, criada_em")
    .order("criada_em", { ascending: false })
    .limit(2000);

  const notaEntrevista = new Map<string, number>();
  for (const a of (avaliacoesData ?? []) as { candidato_id: string; nota: number }[]) {
    // As linhas vêm da mais recente para a mais antiga: a primeira de cada
    // candidato é a que vale.
    if (!notaEntrevista.has(a.candidato_id)) notaEntrevista.set(a.candidato_id, Number(a.nota));
  }

  // ------------------------------------------------------------- FILTROS
  let linhas = candidatos.map((c) => ({ c, a: analises.get(c.id) ?? null }));

  if (searchParams.provincia) linhas = linhas.filter((l) => l.c.provincia === searchParams.provincia);
  if (searchParams.municipio) linhas = linhas.filter((l) => l.c.municipio === searchParams.municipio);
  if (searchParams.alertas === "sim") linhas = linhas.filter((l) => (l.a?.alertas?.length ?? 0) > 0);

  if (searchParams.escalao) {
    const min = Number(searchParams.escalao);
    linhas = linhas.filter((l) => (l.a?.pontuacao_total ?? -1) >= min);
  }

  // Por pontuação, os não analisados no fim.
  linhas.sort((x, y) => (y.a?.pontuacao_total ?? -1) - (x.a?.pontuacao_total ?? -1));

  // A posição no ranking é a da lista inteira, não a da página: o 11.º
  // continua a ser o 11.º quando aparece no cimo da segunda página.
  const ordenadas = linhas.map((l, i) => ({ ...l, posicao: i + 1 }));

  const fatia = lerPaginacao(searchParams, ordenadas.length);
  const daPagina = fatiar(ordenadas, fatia);

  // --------------------------------------------------------- INDICADORES
  // "Analisada" é análise concluída COM a versão actual do motor de leitura.
  // Uma análise feita por uma versão anterior conta como estando por refazer.
  const actualizada = (a: AnaliseDoPainel | null | undefined) =>
    a?.estado === "concluida" && a.pontuacao_detalhe?.motor === versaoMotor();

  const analisados = candidatos.filter((c) => actualizada(analises.get(c.id))).length;
  const porAnalisar = candidatos.length - analisados;
  const desactualizadas = candidatos.filter(
    (c) => analises.get(c.id)?.estado === "concluida" && !actualizada(analises.get(c.id))
  ).length;
  const comPontuacao = candidatos
    .map((c) => analises.get(c.id)?.pontuacao_total)
    .filter((p): p is number => typeof p === "number");
  const media = comPontuacao.length
    ? Math.round((comPontuacao.reduce((s, n) => s + n, 0) / comPontuacao.length) * 10) / 10
    : 0;

  const comExperiencia = candidatos.filter((c) => c.experiencia_similar).length;
  const comCarta = candidatos.filter((c) => c.tem_carta).length;
  const diasAtePrazo = Math.max(
    0,
    Math.ceil((new Date(definicoes.prazo).getTime() - Date.now()) / 86400000)
  );

  const indicadores = [
    { rotulo: "Candidaturas", valor: candidatos.length, icone: ScrollText, cor: "text-consulvolt-preto" },
    { rotulo: "Analisadas", valor: analisados, icone: Sparkles, cor: "text-violet-600" },
    { rotulo: "Pontuação média", valor: media, icone: Sparkles, cor: "text-consulvolt-vermelho" },
    { rotulo: "Com experiência", valor: comExperiencia, icone: MapPin, cor: "text-emerald-600" },
    { rotulo: "Com carta", valor: comCarta, icone: Car, cor: "text-sky-600" },
    { rotulo: "Dias até ao fecho", valor: diasAtePrazo, icone: CalendarClock, cor: "text-slate-600" },
  ];

  const filtros: { rotulo: string; params: string }[] = [
    { rotulo: "Todos", params: "" },
    { rotulo: "70 pontos ou mais", params: "escalao=70" },
    { rotulo: "50 pontos ou mais", params: "escalao=50" },
    { rotulo: "Com alertas", params: "alertas=sim" },
  ];

  // O filtro activo compara-se só pelos filtros, sem a paginação.
  const { pagina: _p, porPagina: _pp, ...soFiltros } = searchParams;
  const filtroActual = new URLSearchParams(
    Object.entries(soFiltros).filter(([, v]) => Boolean(v)) as [string, string][]
  ).toString();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Ranking</h1>
          <p className="text-sm text-muted-foreground">
            {concursoActivo?.nome || "Concurso Geral"} • Avaliação baseada na {rubrica.nome} ({totalMaximo} pts).
          </p>
        </div>
        {porAnalisar > 0 && <BotaoAnalisarTodos quantos={porAnalisar} />}
      </div>

      {desactualizadas > 0 && (
        <div className="flex flex-wrap items-start gap-2.5 rounded-lg border border-violet-200 bg-violet-50 p-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <p className="flex-1 text-sm text-violet-900">
            <strong>{desactualizadas}</strong> análise(s) foram feitas por uma versão anterior da
            leitura de documentos e estão por baixo do que o sistema já consegue ler hoje. Carrega
            em <em>Analisar</em> para as refazer - as pontuações antigas não se perdem, ficam
            guardadas no histórico.
          </p>
        </div>
      )}

      {/* Regra de interface que não se negoceia */}
      <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <p className="text-sm text-slate-600">
          Esta pontuação é uma <strong>ordenação sugerida</strong>, não uma decisão. A aprovação
          continua a ser um acto explícito na ficha de cada candidato, feito por uma pessoa.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {indicadores.map((i) => {
          const Icone = i.icone;
          return (
            <Card key={i.rotulo}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-1">
                  <p className={`text-xl font-bold ${i.cor}`}>{i.valor}</p>
                  <Icone className={`h-3.5 w-3.5 ${i.cor}`} />
                </div>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{i.rotulo}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <LegendaRanking />

      <div className="flex flex-wrap gap-1.5">
        {filtros.map((f) => (
          <Link
            key={f.rotulo}
            href={f.params ? `/admin/ranking?${f.params}` : "/admin/ranking"}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filtroActual === f.params
                ? "border-primary bg-primary text-primary-foreground"
                : "border-slate-300 bg-white text-slate-600 hover:border-primary hover:text-primary"
            }`}
          >
            {f.rotulo}
          </Link>
        ))}
      </div>

      {ordenadas.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white py-12 text-center text-sm text-muted-foreground">
          Nenhuma candidatura corresponde a este filtro.
        </p>
      ) : (
        <div className="space-y-3 rounded-xl border bg-white p-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="w-12 px-3 py-2.5 text-xs font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Candidato</th>
                  <th className="hidden px-3 py-2.5 text-xs font-medium text-muted-foreground md:table-cell">
                    Residência
                  </th>
                  <th className="w-28 px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                    Pontuação
                  </th>
                  <th className="hidden w-[220px] px-3 py-2.5 text-xs font-medium text-muted-foreground lg:table-cell">
                    Campo / Eléctrica / Residência
                  </th>
                  <th className="w-[110px] px-3 py-2.5 text-xs font-medium text-muted-foreground">
                    Entrevista
                  </th>
                  <th className="w-24 px-3 py-2.5 text-xs font-medium text-muted-foreground">Estado</th>
                </tr>
              </thead>
              <tbody>
                {daPagina.map(({ c, a, posicao }) => {
                  const d = a?.pontuacao_detalhe ?? null;
                  const contagem = contarAlertas(a?.alertas);
                  const escalao = escalaoDe(a?.pontuacao_total, a?.eliminado);
                  const listaAlertas = a?.alertas ?? [];

                  return (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                        {a?.pontuacao_total != null ? posicao : "-"}
                      </td>

                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/candidato/${c.id}`}
                          className="font-medium hover:text-consulvolt-vermelho hover:underline"
                        >
                          {c.nome}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {a?.eliminado && (
                            <Dica
                              titulo="Requisito eliminatório em falta"
                              conteudo={
                                <p>
                                  {a.motivo_eliminacao ??
                                    "A rubrica considera este candidato eliminado."}{" "}
                                  A decisão final continua a ser tua: podes aprová-lo na ficha.
                                </p>
                              }
                            >
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 ring-1 ring-rose-300">
                                ELIMINADO
                              </span>
                            </Dica>
                          )}

                          {contagem.total > 0 && (
                            <Dica
                              titulo={`${contagem.total} alerta${contagem.total > 1 ? "s" : ""} nesta candidatura`}
                              conteudo={
                                <ul className="space-y-2">
                                  {listaAlertas.map((al, k) => (
                                    <li key={k} className="flex gap-2">
                                      <span
                                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${GRAVIDADES[al.gravidade].ponto}`}
                                      />
                                      <span>
                                        <span className="font-semibold">
                                          {GRAVIDADES[al.gravidade].rotulo}:
                                        </span>{" "}
                                        {al.mensagem}
                                        <span className="mt-0.5 block text-slate-400">
                                          {DESCRICAO_ALERTA[al.tipo]}
                                        </span>
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              }
                            >
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${GRAVIDADES[contagem.dominante].cor}`}
                              >
                                {contagem.total} alerta{contagem.total > 1 ? "s" : ""}
                              </span>
                            </Dica>
                          )}

                          <span className="text-xs text-muted-foreground md:hidden">
                            {c.municipio}
                          </span>
                        </div>
                      </td>

                      <td className="hidden px-3 py-3 md:table-cell">
                        <span className="text-sm">{c.municipio}</span>
                        <span className="block text-xs text-muted-foreground">{c.provincia}</span>
                      </td>

                      <td className="px-3 py-3 text-right">
                        <Dica
                          titulo={
                            a?.pontuacao_total != null
                              ? `${escalao.rotulo}: ${a.pontuacao_total} de ${totalMaximo} pontos`
                              : "Ainda por analisar"
                          }
                          conteudo={
                            d ? (
                              <div className="space-y-2">
                                <p className="text-slate-300">{escalao.descricao}</p>
                                <ul className="space-y-0.5 border-t border-slate-700 pt-2">
                                  {d.criterios.map((cr) => (
                                    <li key={cr.codigo} className="flex justify-between gap-3">
                                      <span className="truncate text-slate-300">
                                        {cr.codigo}. {cr.nome}
                                      </span>
                                      <span
                                        className={`shrink-0 font-mono ${cr.pontos === 0 ? "text-slate-500" : ""}`}
                                      >
                                        {cr.pontos}/{cr.maximo}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <p className="text-slate-300">{escalao.descricao}</p>
                            )
                          }
                        >
                          {a?.pontuacao_total != null ? (
                            <span
                              className={`inline-flex items-baseline gap-1 rounded-md px-2 py-1 font-mono text-base font-bold tabular-nums ${escalao.cor}`}
                            >
                              {a.pontuacao_total}
                              <span className="text-[10px] font-normal opacity-70">
                                /{totalMaximo}
                              </span>
                            </span>
                          ) : (
                            <span className="rounded-md px-2 py-1 text-xs text-muted-foreground ring-1 ring-dashed ring-slate-300">
                              por analisar
                            </span>
                          )}
                        </Dica>
                      </td>

                      <td className="hidden px-3 py-3 lg:table-cell">
                        {d ? (
                          <div className="space-y-1">
                            {BARRAS.map((_, k) => (
                              <BarraComDica key={k} detalhe={d} indice={k} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {(() => {
                          const nota = notaEntrevista.get(c.id);
                          if (nota === undefined) {
                            return (
                              <span className="whitespace-nowrap text-xs text-muted-foreground">
                                por entrevistar
                              </span>
                            );
                          }
                          const e = escalaoDaNota(nota);
                          return (
                            <span
                              className={`inline-flex items-baseline gap-0.5 rounded-md px-2 py-1 font-mono text-sm font-bold tabular-nums ${e.crachá}`}
                              title={`Entrevista: ${e.rotulo}`}
                            >
                              {nota}
                              <span className="text-[10px] font-normal opacity-70">/100</span>
                            </span>
                          );
                        })()}
                      </td>

                      <td className="px-3 py-3">
                        <Badge variant={varianteDoEstado(c.status)}>{c.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Paginacao fatia={fatia} nome="candidatura" />
        </div>
      )}
    </div>
  );
}
