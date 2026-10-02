import { AlertCircle } from "lucide-react";

import { ListaEntrevistas, IndicadoresEntrevistas } from "@/components/lista-entrevistas";
import { FiltrosEntrevistas } from "@/components/filtros-entrevistas";
import { Paginacao } from "@/components/paginacao";
import { carregarEntrevistas, listarRecrutadores } from "@/lib/entrevista/atribuicoes";
import { filtrarEntrevistas } from "@/lib/entrevista/filtrar";
import { fatiar, lerPaginacao } from "@/lib/paginacao";
import { sessaoActual } from "@/lib/utilizadores";
import { pode } from "@/lib/permissoes";
import type { Estado } from "@/lib/entrevista/estados";

/**
 * O corpo partilhado pelas quatro listas (visão geral, agendadas, em
 * entrevista, concluídas). Muda o filtro de base e o texto do vazio; os
 * filtros, a paginação e o resto são iguais, e mantê-los num sítio só evita
 * quatro páginas que vão divergindo com o tempo.
 *
 * Os indicadores do topo contam SEMPRE a lista inteira, e não a filtrada:
 * são o retrato do processo, e mudarem quando se procura um nome tornava-os
 * inúteis como referência.
 */
export async function PaginaDeEntrevistas({
  estados,
  comIndicadores = false,
  vazio,
  searchParams,
}: {
  /** Null mostra tudo. */
  estados: Estado[] | null;
  comIndicadores?: boolean;
  vazio: { titulo: string; texto: string };
  searchParams: Record<string, string | undefined>;
}) {
  const [sessao, { linhas, porMigrar, totalCandidatos }, recrutadores] = await Promise.all([
    sessaoActual(),
    carregarEntrevistas(),
    listarRecrutadores(),
  ]);

  if (porMigrar) return <FaltaMigracao />;

  const daPagina = estados ? linhas.filter((l) => estados.includes(l.estado)) : linhas;

  const filtradas = filtrarEntrevistas(
    linhas,
    {
      q: searchParams.q,
      estado: searchParams.estado,
      recrutador: searchParams.recrutador,
      grupo: searchParams.grupo,
      municipio: searchParams.municipio,
    },
    estados
  );

  const fatia = lerPaginacao(searchParams, filtradas.length);
  const visiveis = fatiar(filtradas, fatia);

  const municipios = Array.from(new Set(linhas.map((l) => l.municipio).filter(Boolean))).sort();

  return (
    <div className="space-y-4">
      {comIndicadores && <IndicadoresEntrevistas linhas={linhas} />}

      {/* A lista é curta de propósito, e vale a pena dizê-lo: sem isto, quem
          abre a página e vê 20 de 180 candidatos pensa que algo se perdeu. */}
      {comIndicadores && totalCandidatos > linhas.length && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-muted-foreground">
          Estão aqui os <strong>{linhas.length}</strong> candidatos já contactados, de{" "}
          {totalCandidatos} candidaturas. Quem ainda não foi contactado não aparece: marca-lhe a
          entrevista em <strong>Comunicações</strong> e ele entra nesta lista.
        </p>
      )}

      <FiltrosEntrevistas
        opcoes={{
          recrutadores: recrutadores.map((r) => ({ utilizador: r.utilizador, nome: r.nome })),
          municipios,
          estadosPermitidos: estados ?? undefined,
        }}
        totalVisivel={filtradas.length}
        totalGeral={daPagina.length}
      />

      <ListaEntrevistas
        linhas={visiveis}
        podeEntrevistar={pode(sessao?.papel, "entrevistar")}
        utilizador={sessao?.utilizador ?? ""}
        vazio={
          filtradas.length === 0 && daPagina.length > 0
            ? {
                titulo: "Nada corresponde a estes filtros",
                texto: "Limpa os filtros para voltar a ver a lista toda.",
              }
            : vazio
        }
      />

      {filtradas.length > 0 && (
        <div className="rounded-xl border bg-white p-2.5">
          <Paginacao fatia={fatia} nome="entrevista" />
        </div>
      )}
    </div>
  );
}

export function FaltaMigracao() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="min-w-0">
        <p className="font-semibold text-amber-900">Falta correr a migração no Supabase</p>
        <p className="mt-1 text-sm text-amber-800">
          O módulo de entrevistas precisa das tabelas novas. Abre o SQL Editor do Supabase, cola o
          ficheiro{" "}
          <code className="break-all rounded bg-amber-100 px-1">
            supabase/CORRER-NO-SUPABASE.sql
          </code>{" "}
          e recarrega esta página. A migração só acrescenta: não apaga nem altera nada do que já lá
          está.
        </p>
      </div>
    </div>
  );
}
