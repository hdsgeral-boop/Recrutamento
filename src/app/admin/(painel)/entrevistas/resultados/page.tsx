import Link from "next/link";
import { Inbox } from "lucide-react";

import { FaltaMigracao } from "@/app/admin/(painel)/entrevistas/pagina-comum";
import { FiltrosEntrevistas } from "@/components/filtros-entrevistas";
import { Paginacao } from "@/components/paginacao";
import { carregarEntrevistas, listarRecrutadores } from "@/lib/entrevista/atribuicoes";
import { podeNaSessao } from "@/lib/utilizadores";
import { RecalcularPontuacao } from "@/components/recalcular-pontuacao";
import { filtrarEntrevistas } from "@/lib/entrevista/filtrar";
import { fatiar, lerPaginacao } from "@/lib/paginacao";
import { escalaoDaNota } from "@/lib/entrevista/pontuacao";
import { NOME_GRUPO } from "@/lib/entrevista/experiencia";
import { dataCurta } from "@/lib/datas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * As notas da entrevista lado a lado com a pontuação da candidatura.
 *
 * As duas colunas ficam SEPARADAS de propósito. Somá-las num número só
 * inventava uma fórmula que ninguém decidiu, e escondia o caso mais
 * interessante: quem tem candidatura fraca e entrevista forte, ou o contrário.
 */
export default async function Resultados({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const [{ linhas, porMigrar }, recrutadores, podeRecalcular] = await Promise.all([
    carregarEntrevistas(),
    listarRecrutadores(),
    podeNaSessao("configurar"),
  ]);
  if (porMigrar) return <FaltaMigracao />;

  const comNota = linhas.filter((l) => l.nota !== null);

  // Os cartões do topo contam TODOS os avaliados, e não os filtrados: são o
  // retrato do recrutamento, e mudarem ao procurar um nome tornava-os inúteis.
  const avaliados = filtrarEntrevistas(comNota, {
    q: searchParams.q,
    estado: searchParams.estado,
    recrutador: searchParams.recrutador,
    grupo: searchParams.grupo,
    municipio: searchParams.municipio,
  }).sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0) || a.nome.localeCompare(b.nome));

  const fatia = lerPaginacao(searchParams, avaliados.length);
  const daPagina = fatiar(avaliados, fatia);
  const municipios = Array.from(new Set(comNota.map((l) => l.municipio).filter(Boolean))).sort();

  if (comNota.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-white py-14 text-center">
        <Inbox className="h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium">Ainda não há entrevistas avaliadas</p>
        <p className="max-w-md px-6 text-sm text-muted-foreground">
          Assim que a primeira avaliação for guardada, a nota aparece aqui ao lado da pontuação da
          candidatura.
        </p>
      </div>
    );
  }

  const media = comNota.length
    ? Math.round(comNota.reduce((s, l) => s + (l.nota ?? 0), 0) / comNota.length)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Cartao rotulo="Entrevistados" valor={String(comNota.length)} />
        <Cartao rotulo="Média das notas" valor={String(media)} />
        <Cartao rotulo="70 ou mais" valor={String(comNota.filter((l) => (l.nota ?? 0) >= 70).length)} cor="text-emerald-600" />
        <Cartao rotulo="Abaixo de 40" valor={String(comNota.filter((l) => (l.nota ?? 0) < 40).length)} cor="text-rose-600" />
      </div>

      <FiltrosEntrevistas
        opcoes={{
          recrutadores: recrutadores.map((r) => ({ utilizador: r.utilizador, nome: r.nome })),
          municipios,
          estadosPermitidos: ["concluida"],
        }}
        totalVisivel={avaliados.length}
        totalGeral={comNota.length}
      />

      {/* Só quem configura o sistema pode mexer nas notas de toda a gente. */}
      {podeRecalcular && <RecalcularPontuacao />}

      {avaliados.length === 0 && (
        <p className="rounded-xl border border-dashed bg-white py-10 text-center text-sm text-muted-foreground">
          Nada corresponde a estes filtros.
        </p>
      )}

      {/* Tabela em ecrã largo, cartões em ecrã estreito. */}
      <div className="hidden overflow-hidden rounded-xl border bg-white sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Candidato</th>
              <th className="px-3 py-2 font-semibold">Grupo</th>
              <th className="px-3 py-2 text-right font-semibold">Candidatura</th>
              <th className="px-3 py-2 text-right font-semibold">Entrevista</th>
              <th className="px-3 py-2 font-semibold">Quando</th>
              <th className="px-3 py-2 font-semibold">Recrutador</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {daPagina.map((l) => {
              const escalao = escalaoDaNota(l.nota ?? 0);
              return (
                <tr key={l.candidatoId} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/candidato/${l.candidatoId}`}
                      className="font-medium hover:text-consulvolt-vermelho hover:underline"
                    >
                      {l.nome}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{l.municipio}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {l.experiencia.grupo === "indeterminado" ? "-" : NOME_GRUPO[l.experiencia.grupo]}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.pontuacaoPerfil ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold", escalao.crachá)}>
                      {l.nota}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {l.avaliadoEm ? dataCurta(l.avaliadoEm) : "-"}
                    {l.versaoRoteiro && (
                      <span className="ml-1 font-mono text-[10px]">{l.versaoRoteiro}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{l.recrutadores.join(", ") || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 sm:hidden">
        {daPagina.map((l) => {
          const escalao = escalaoDaNota(l.nota ?? 0);
          return (
            <li key={l.candidatoId} className="rounded-xl border bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/candidato/${l.candidatoId}`}
                    className="block truncate font-medium hover:text-consulvolt-vermelho hover:underline"
                  >
                    {l.nome}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.municipio}
                    {l.recrutadores.length > 0 && ` · ${l.recrutadores.join(", ")}`}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded px-2 py-1 text-sm font-bold", escalao.crachá)}>
                  {l.nota}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Candidatura {l.pontuacaoPerfil ?? "-"} pts
                {l.avaliadoEm && ` · entrevistado a ${dataCurta(l.avaliadoEm)}`}
              </p>
            </li>
          );
        })}
      </ul>

      {avaliados.length > 0 && (
        <div className="rounded-xl border bg-white p-2.5">
          <Paginacao fatia={fatia} nome="resultado" />
        </div>
      )}

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-muted-foreground">
        As duas pontuações ficam separadas de propósito. Somá-las num número só inventava uma
        fórmula que ninguém decidiu, e escondia os casos que mais interessam: candidatura fraca com
        entrevista forte, e o contrário.
      </p>
    </div>
  );
}

function Cartao({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <p className={cn("text-2xl font-bold leading-none", cor ?? "text-consulvolt-preto")}>{valor}</p>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{rotulo}</p>
    </div>
  );
}
