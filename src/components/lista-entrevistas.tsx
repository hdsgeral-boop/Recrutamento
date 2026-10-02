import Link from "next/link";
import { CalendarClock, Inbox, UserCheck, UserX } from "lucide-react";

import { cn } from "@/lib/utils";
import { DEFINICOES_ESTADO, type Estado } from "@/lib/entrevista/estados";
import { NOME_GRUPO } from "@/lib/entrevista/experiencia";
import { porExtensoComDia } from "@/lib/datas";
import type { LinhaEntrevista } from "@/lib/entrevista/atribuicoes";

/**
 * ===========================================================================
 * A LISTA DE ENTREVISTAS, AGRUPADA POR DIA
 * ---------------------------------------------------------------------------
 * Quem trabalha com isto pergunta "o que tenho hoje", não "onde está o
 * candidato X". Por isso o agrupamento é por data, com os sem data no fim -
 * e não uma tabela ordenada por nome.
 *
 * Em ecrã estreito cada linha vira um cartão em vez de uma linha de tabela
 * espremida. Uma tabela de seis colunas num telemóvel ou corta o conteúdo ou
 * obriga a rolar de lado, e as duas coisas perdem informação.
 * ===========================================================================
 */

const SEM_DATA = "sem-data";

/** AAAA-MM-DD em hora de Angola, ou SEM_DATA quando não há data que sirva. */
function diaDe(iso: string | null): string {
  if (!iso) return SEM_DATA;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return SEM_DATA;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Luanda",
  }).format(d);
}

/** A hora, ou nada quando a data não presta. */
function horaDe(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Luanda",
  }).format(d);
}

export function ListaEntrevistas({
  linhas,
  podeEntrevistar,
  utilizador,
  vazio,
}: {
  linhas: LinhaEntrevista[];
  /** Quem vê pode abrir a entrevista de qualquer candidato. */
  podeEntrevistar: boolean;
  /** Quem está ligado, para saber quais são "os meus". */
  utilizador: string;
  vazio: { titulo: string; texto: string };
}) {
  if (linhas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-white py-14 text-center">
        <Inbox className="h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium">{vazio.titulo}</p>
        <p className="max-w-md px-6 text-sm text-muted-foreground">{vazio.texto}</p>
      </div>
    );
  }

  // Agrupar por dia em hora de Angola. Sem data fica num grupo próprio, no fim.
  //
  // Uma data ilegível conta como "sem data" em vez de deitar a página abaixo.
  // Basta uma linha estragada na base - e elas aparecem, vindas de importações
  // antigas - para uma lista inteira deixar de abrir, e quem está a trabalhar
  // fica sem nada em vez de ficar sem uma linha.
  const grupos = new Map<string, LinhaEntrevista[]>();
  for (const l of linhas) {
    const dia = diaDe(l.quando);
    const lista = grupos.get(dia) ?? [];
    lista.push(l);
    grupos.set(dia, lista);
  }

  const ordenados = [...grupos.entries()].sort(([a], [b]) => {
    if (a === SEM_DATA) return 1;
    if (b === SEM_DATA) return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-5">
      {ordenados.map(([dia, doDia]) => (
        <section key={dia}>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold first-letter:uppercase">
              {dia === SEM_DATA
                ? "Sem data marcada"
                : porExtensoComDia(doDia.find((l) => diaDe(l.quando) !== SEM_DATA)!.quando!).split(
                    " às "
                  )[0]}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {doDia.length}
            </span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <ul className="space-y-2">
            {doDia
              .slice()
              .sort((x, y) => (x.quando ?? "").localeCompare(y.quando ?? "") || x.nome.localeCompare(y.nome))
              .map((l) => (
                <LinhaCandidato
                  key={l.candidatoId}
                  l={l}
                  meu={l.recrutadores.includes(utilizador)}
                  podeEntrevistar={podeEntrevistar || l.recrutadores.includes(utilizador)}
                />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function LinhaCandidato({
  l,
  meu,
  podeEntrevistar,
}: {
  l: LinhaEntrevista;
  meu: boolean;
  podeEntrevistar: boolean;
}) {
  const estado = DEFINICOES_ESTADO[l.estado as Estado];

  return (
    <li className="rounded-xl border bg-white p-3 transition-colors hover:border-slate-300 sm:p-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {/* ------------------------------------------------- QUEM --------- */}
        <div className="min-w-0 flex-1 basis-[220px]">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/candidato/${l.candidatoId}`}
              className="truncate font-medium hover:text-consulvolt-vermelho hover:underline"
            >
              {l.nome}
            </Link>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", estado.crachá)}>
              {estado.rotulo}
            </span>
            {meu && (
              <span className="rounded-full bg-consulvolt-vermelho px-2 py-0.5 text-[11px] font-semibold text-white">
                teu
              </span>
            )}
          </div>

          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {l.municipio}
            {horaDe(l.quando) && (
              <>
                {" · "}
                <span className="font-medium text-sky-700">{horaDe(l.quando)}</span>
              </>
            )}
            {l.pontuacaoPerfil !== null && ` · candidatura ${l.pontuacaoPerfil} pts`}
          </p>

          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {l.experiencia.grupo === "indeterminado" ? (
              <span className="text-amber-700">Grupo por decidir</span>
            ) : (
              NOME_GRUPO[l.experiencia.grupo]
            )}
          </p>
        </div>

        {/* ------------------------------------------- RECRUTADOR --------- */}
        <div className="flex shrink-0 items-center gap-1.5 text-xs">
          {l.recrutadores.length > 0 ? (
            <>
              <UserCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span
                className="max-w-[160px] truncate"
                title={l.recrutadores.join(", ")}
              >
                {l.recrutadores[0]}
                {l.recrutadores.length > 1 && (
                  <span className="ml-1 rounded bg-slate-200 px-1 py-0.5 text-[10px] font-semibold text-slate-700">
                    +{l.recrutadores.length - 1}
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <UserX className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="text-muted-foreground">sem recrutador</span>
            </>
          )}
        </div>

        {/* ---------------------------------------------- ACÇÃO ----------- */}
        <div className="flex shrink-0 items-center gap-2">
          {l.nota !== null && (
            <span className="rounded-lg bg-slate-100 px-2 py-1 text-sm font-bold text-slate-800">
              {l.nota}
              <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">/100</span>
            </span>
          )}

          <Link
            href={`/admin/candidato/${l.candidatoId}#entrevista`}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              !podeEntrevistar
                ? "pointer-events-none border bg-slate-50 text-slate-400"
                : l.estado === "concluida"
                  ? "border bg-white text-slate-700 hover:border-slate-400"
                  : "bg-consulvolt-vermelho text-white hover:opacity-90"
            )}
          >
            {!podeEntrevistar
              ? "Não é teu"
              : l.estado === "concluida"
                ? "Ver avaliação"
                : l.estado === "em_entrevista"
                  ? "Continuar"
                  : "Iniciar entrevista"}
          </Link>
        </div>
      </div>
    </li>
  );
}

/** Os indicadores do topo da visão geral. */
export function IndicadoresEntrevistas({ linhas }: { linhas: LinhaEntrevista[] }) {
  const conta = (e: Estado) => linhas.filter((l) => l.estado === e).length;

  const cartoes = [
    { rotulo: "Por atribuir", valor: conta("nao_atribuida"), cor: "text-slate-500" },
    { rotulo: "Atribuídas", valor: conta("atribuida"), cor: "text-violet-600" },
    { rotulo: "Agendadas", valor: conta("agendada"), cor: "text-sky-600" },
    { rotulo: "Em entrevista", valor: conta("em_entrevista"), cor: "text-amber-600" },
    { rotulo: "Concluídas", valor: conta("concluida"), cor: "text-emerald-600" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {cartoes.map((c) => (
        <div key={c.rotulo} className="rounded-xl border bg-white p-3">
          <p className={cn("text-2xl font-bold leading-none", c.cor)}>{c.valor}</p>
          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{c.rotulo}</p>
        </div>
      ))}
    </div>
  );
}
