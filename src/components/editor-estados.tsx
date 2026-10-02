"use client";

import { useState, useTransition } from "react";
import { Check, Layers, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { guardarEstados } from "@/app/admin/accoes-funil";
import { ESTADOS_PADRAO, type EstadoCandidato } from "@/lib/funil/padrao";

/**
 * ===========================================================================
 * EDITOR DOS ESTADOS
 * ---------------------------------------------------------------------------
 * O campo que interessa explicar é o dos «nomes antigos». É ele que permite
 * mudar o vocabulário sem tocar numa única linha da base de dados: uma
 * candidatura gravada há um mês como "Pendente" continua gravada como
 * "Pendente", e aparece como Identificado porque "Pendente" está na lista de
 * nomes antigos desse estado.
 *
 * Tirar um nome antigo dali não apaga candidatura nenhuma - só faz com que
 * elas deixem de aparecer nas contagens, que é pior, porque é invisível. Daí
 * o aviso por baixo do campo.
 * ===========================================================================
 */

export function EditorEstados({
  iniciais,
  contagens,
  daBaseDeDados,
  porMigrar,
}: {
  iniciais: EstadoCandidato[];
  /** Quantas candidaturas há em cada estado, para ninguém apagar às cegas. */
  contagens: Record<string, number>;
  daBaseDeDados: boolean;
  porMigrar: boolean;
}) {
  const [estados, setEstados] = useState<EstadoCandidato[]>(iniciais);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [aGravar, gravar] = useTransition();

  const mudar = (i: number, campo: keyof EstadoCandidato, valor: unknown) => {
    setEstados((lista) => lista.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)));
    setRecado(null);
  };

  return (
    <section className="rounded-xl border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Layers className="mt-0.5 h-5 w-5 shrink-0 text-consulvolt-vermelho" aria-hidden />
          <div className="min-w-0">
            <h2 className="font-semibold">Estados do candidato</h2>
            <p className="text-sm text-muted-foreground">
              Por onde passa cada pessoa, do primeiro contacto ao contrato. Mudar um nome aqui muda-o
              em todo o painel, sem mexer no que já está gravado.
            </p>
          </div>
        </div>

        <Button
          type="button" variant="outline" size="sm" disabled={aGravar}
          onClick={() => { setEstados(ESTADOS_PADRAO); setRecado(null); }}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Repor os de origem
        </Button>
      </div>

      {porMigrar && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          As colunas ainda não existem no Supabase. Corre a migração{" "}
          <strong>20260922c_dashboard_e_funil.sql</strong> antes de gravar.
        </p>
      )}
      {!daBaseDeDados && !porMigrar && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-muted-foreground">
          A usar os valores de origem. A primeira gravação passa a mandar.
        </p>
      )}

      <ol className="mt-4 space-y-3">
        {estados.map((e, i) => {
          const quantas =
            (contagens[e.chave] ?? 0) +
            e.aliases.reduce((s, a) => s + (contagens[a] ?? 0), 0);

          return (
            <li key={e.chave} className="rounded-lg border bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="block text-xs font-medium text-slate-700">
                  Nome {i + 1}
                  <input
                    value={e.nome}
                    onChange={(ev) => mudar(i, "nome", ev.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                  />
                </label>

                <label className="block text-xs font-medium text-slate-700">
                  O que falta fazer a estes
                  <input
                    value={e.proximoPasso}
                    onChange={(ev) => mudar(i, "proximoPasso", ev.target.value)}
                    placeholder="Ex.: contactar e marcar entrevista"
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-2 pb-0.5">
                  <span
                    className="inline-flex h-10 items-center gap-1.5 rounded-md bg-white px-2 text-xs ring-1 ring-slate-200"
                    title="Candidaturas neste estado agora"
                  >
                    <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: e.cor }} aria-hidden />
                    <strong className="tabular-nums text-slate-900">{quantas}</strong>
                  </span>

                  <label className="flex items-center gap-1.5 text-xs text-slate-700">
                    <input
                      type="checkbox" checked={e.terminal}
                      onChange={(ev) => mudar(i, "terminal", ev.target.checked)}
                      className="h-4 w-4"
                    />
                    Saída
                  </label>

                  <Button
                    type="button" variant="outline" size="sm"
                    className="h-9 w-9 p-0 text-rose-600 hover:bg-rose-50"
                    onClick={() => setEstados(estados.filter((_, j) => j !== i))}
                    disabled={quantas > 0}
                    title={
                      quantas > 0
                        ? `Há ${quantas} candidatura(s) neste estado. Move-as antes de o apagar.`
                        : `Apagar ${e.nome}`
                    }
                    aria-label={`Apagar ${e.nome}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>

              <label className="mt-2 block text-xs font-medium text-slate-700">
                Nomes antigos que contam como este
                <input
                  value={e.aliases.join(", ")}
                  onChange={(ev) =>
                    mudar(
                      i,
                      "aliases",
                      ev.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                    )
                  }
                  placeholder="Separados por vírgula"
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  Tirar um nome daqui não apaga nada, mas essas candidaturas deixam de ser contadas
                  neste estado.
                </span>
              </label>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button" disabled={aGravar}
          onClick={() =>
            gravar(async () => {
              const r = await guardarEstados(estados);
              setRecado({ ok: r.ok, texto: r.ok ? "Estados gravados." : r.mensagem });
            })
          }
        >
          {aGravar && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
          Guardar os estados
        </Button>

        <Button
          type="button" variant="outline" disabled={aGravar}
          onClick={() =>
            setEstados([
              ...estados,
              {
                chave: `Estado ${estados.length + 1}`,
                ordem: estados.length + 1,
                nome: `Estado ${estados.length + 1}`,
                cor: "#64748b",
                proximoPasso: "",
                terminal: false,
                aliases: [],
                activo: true,
              },
            ])
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Acrescentar estado
        </Button>
      </div>

      {recado && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            recado.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
          }`}
          role="status"
        >
          {recado.ok ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          {recado.texto}
        </p>
      )}
    </section>
  );
}
