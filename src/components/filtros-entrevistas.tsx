"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { DEFINICOES_ESTADO, ESTADOS, type Estado } from "@/lib/entrevista/estados";
import { NOME_GRUPO } from "@/lib/entrevista/experiencia";

/**
 * ===========================================================================
 * FILTROS DAS LISTAS DE ENTREVISTAS
 * ---------------------------------------------------------------------------
 * Escrevem no endereço, como o resto do painel: sobrevivem ao recarregar,
 * podem ser enviados por link a um colega, e o botão de voltar do browser
 * funciona.
 *
 * Mudar um filtro volta sempre à primeira página. Quem está na página 7 e
 * filtra por um recrutador com cinco candidatos cairia numa página vazia que
 * parece uma avaria.
 * ===========================================================================
 */

export interface OpcoesFiltro {
  recrutadores: { utilizador: string; nome: string }[];
  municipios: string[];
  /** Os estados que esta lista pode mostrar. Vazio = todos. */
  estadosPermitidos?: Estado[];
}

export function FiltrosEntrevistas({
  opcoes,
  totalVisivel,
  totalGeral,
}: {
  opcoes: OpcoesFiltro;
  totalVisivel: number;
  totalGeral: number;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();
  const [aCarregar, iniciar] = useTransition();

  const valor = (chave: string) => parametros.get(chave) ?? "";

  const mudar = useCallback(
    (chave: string, novo: string) => {
      const p = new URLSearchParams(parametros.toString());
      if (novo) p.set(chave, novo);
      else p.delete(chave);
      p.delete("pagina");
      iniciar(() => router.replace(`${caminho}?${p.toString()}`, { scroll: false }));
    },
    [parametros, caminho, router]
  );

  const limpar = () => iniciar(() => router.replace(caminho, { scroll: false }));

  const activos = ["q", "estado", "recrutador", "grupo", "municipio"].filter((c) => valor(c));

  const estados = (opcoes.estadosPermitidos?.length ? opcoes.estadosPermitidos : ESTADOS) as Estado[];

  return (
    <div className="space-y-2 rounded-xl border bg-white p-2.5 sm:p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[170px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            // defaultValue e não value: escrever devolve ao servidor a cada
            // tecla se for controlado, e o campo perde o cursor a meio.
            defaultValue={valor("q")}
            onChange={(e) => mudar("q", e.target.value)}
            placeholder="Procurar por nome, email ou município"
            className="h-9 w-full rounded-md border border-input bg-white pl-8 pr-2 text-sm"
          />
        </div>

        <Escolha
          rotulo="Todos os estados"
          valor={valor("estado")}
          mudar={(v) => mudar("estado", v)}
          opcoes={estados.map((e) => ({ v: e, t: DEFINICOES_ESTADO[e].rotulo }))}
        />

        <Escolha
          rotulo="Todos os recrutadores"
          valor={valor("recrutador")}
          mudar={(v) => mudar("recrutador", v)}
          opcoes={[
            { v: "sem", t: "Sem recrutador" },
            ...opcoes.recrutadores.map((r) => ({ v: r.utilizador, t: r.nome })),
          ]}
        />

        <Escolha
          rotulo="Com e sem experiência"
          valor={valor("grupo")}
          mudar={(v) => mudar("grupo", v)}
          opcoes={[
            { v: "com_experiencia", t: NOME_GRUPO.com_experiencia },
            { v: "sem_experiencia", t: NOME_GRUPO.sem_experiencia },
            { v: "indeterminado", t: "Grupo por decidir" },
          ]}
        />

        {opcoes.municipios.length > 1 && (
          <Escolha
            rotulo="Todos os municípios"
            valor={valor("municipio")}
            mudar={(v) => mudar("municipio", v)}
            opcoes={opcoes.municipios.map((m) => ({ v: m, t: m }))}
          />
        )}

        {aCarregar && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {totalVisivel === totalGeral
            ? `${totalGeral} candidato(s)`
            : `${totalVisivel} de ${totalGeral} candidato(s)`}
        </span>

        {activos.length > 0 && (
          <button
            type="button"
            onClick={limpar}
            className="flex items-center gap-1 font-medium text-consulvolt-vermelho hover:underline"
          >
            <X className="h-3 w-3" />
            Limpar {activos.length} filtro{activos.length > 1 ? "s" : ""}
          </button>
        )}
      </div>
    </div>
  );
}

function Escolha({
  rotulo,
  valor,
  mudar,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  mudar: (v: string) => void;
  opcoes: { v: string; t: string }[];
}) {
  return (
    <select
      value={valor}
      onChange={(e) => mudar(e.target.value)}
      className={cn(
        "h-9 max-w-[190px] rounded-md border bg-white px-2 text-sm",
        valor ? "border-consulvolt-vermelho text-consulvolt-preto" : "border-input text-slate-600"
      )}
    >
      <option value="">{rotulo}</option>
      {opcoes.map((o) => (
        <option key={o.v} value={o.v}>
          {o.t}
        </option>
      ))}
    </select>
  );
}
