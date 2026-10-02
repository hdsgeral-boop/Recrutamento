"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, GitBranch, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { guardarNiveis } from "@/app/admin/accoes-funil";
import { precisosPorNivel } from "@/lib/funil/calcular";
import { NIVEIS_PADRAO, type EstadoCandidato, type NivelFunil } from "@/lib/funil/padrao";

/**
 * ===========================================================================
 * EDITOR DO FUNIL
 * ---------------------------------------------------------------------------
 * A coluna que faz este editor valer a pena é a dos «precisos»: recalcula-se
 * a cada tecla. Baixar a taxa da pré-selecção de 55 para 40 deixa de ser uma
 * abstracção e passa a ser «são precisas 399 candidaturas em vez de 290».
 * Sem isso, ninguém sabe o que está a mudar até ser tarde.
 * ===========================================================================
 */

export function EditorFunil({
  iniciais,
  estados,
  alvo,
  daBaseDeDados,
  porMigrar,
}: {
  iniciais: NivelFunil[];
  estados: EstadoCandidato[];
  alvo: number;
  daBaseDeDados: boolean;
  porMigrar: boolean;
}) {
  const [niveis, setNiveis] = useState<NivelFunil[]>(iniciais);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [aGravar, gravar] = useTransition();

  const precisos = useMemo(() => precisosPorNivel(niveis, alvo), [niveis, alvo]);

  const mudar = (i: number, campo: keyof NivelFunil, valor: unknown) => {
    setNiveis((lista) => lista.map((n, j) => (j === i ? { ...n, [campo]: valor } : n)));
    setRecado(null);
  };

  const alternarEstado = (i: number, chave: string) => {
    setNiveis((lista) =>
      lista.map((n, j) =>
        j === i
          ? {
              ...n,
              estados: n.estados.includes(chave)
                ? n.estados.filter((c) => c !== chave)
                : [...n.estados, chave],
            }
          : n
      )
    );
    setRecado(null);
  };

  return (
    <section className="rounded-xl border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <GitBranch className="mt-0.5 h-5 w-5 shrink-0 text-consulvolt-vermelho" aria-hidden />
          <div className="min-w-0">
            <h2 className="font-semibold">Funil de recrutamento</h2>
            <p className="text-sm text-muted-foreground">
              Os degraus e a percentagem que se espera que passe de cada um para o seguinte. Os
              «precisos» saem do alvo de {alvo} contratação(ões), contados de trás para a frente.
            </p>
          </div>
        </div>

        <Button
          type="button" variant="outline" size="sm" disabled={aGravar}
          onClick={() => { setNiveis(NIVEIS_PADRAO); setRecado(null); }}
          title="Volta aos degraus e taxas do piloto do Bengo"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Repor os de origem
        </Button>
      </div>

      {porMigrar && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          As colunas ainda não existem no Supabase. Podes editar, mas só grava depois de correres a
          migração <strong>20260922c_dashboard_e_funil.sql</strong>.
        </p>
      )}
      {!daBaseDeDados && !porMigrar && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-muted-foreground">
          A usar os valores de origem. A primeira gravação passa a mandar.
        </p>
      )}

      <ol className="mt-4 space-y-3">
        {niveis.map((n, i) => (
          <li key={n.chave} className="rounded-lg border bg-slate-50 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_7rem_6rem_auto] sm:items-end">
              <label className="block text-xs font-medium text-slate-700">
                Degrau {i + 1}
                <input
                  value={n.nome}
                  onChange={(e) => mudar(i, "nome", e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                />
              </label>

              <label className="block text-xs font-medium text-slate-700">
                Passa (%)
                <input
                  type="number" min={1} max={100} step={1}
                  value={n.taxaPrevista ?? ""}
                  disabled={i === 0}
                  placeholder={i === 0 ? "entrada" : ""}
                  onChange={(e) =>
                    mudar(i, "taxaPrevista", e.target.value === "" ? null : Number(e.target.value))
                  }
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm tabular-nums disabled:bg-slate-100 disabled:text-muted-foreground"
                />
              </label>

              <div className="text-xs font-medium text-slate-700">
                Precisos
                <p className="mt-1 flex h-10 items-center rounded-md bg-white px-2 text-base font-bold tabular-nums text-slate-900 ring-1 ring-slate-200">
                  {precisos[i]?.toLocaleString("pt-PT") ?? 0}
                </p>
              </div>

              <div className="flex items-center gap-2 pb-0.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox" checked={n.activo}
                    onChange={(e) => mudar(i, "activo", e.target.checked)}
                    className="h-4 w-4"
                  />
                  Ligado
                </label>
                <Button
                  type="button" variant="outline" size="sm"
                  className="h-9 w-9 p-0 text-rose-600 hover:bg-rose-50"
                  onClick={() => setNiveis(niveis.filter((_, j) => j !== i))}
                  aria-label={`Apagar ${n.nome}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </div>

            <label className="mt-2 block text-xs font-medium text-slate-700">
              Perde-se aqui
              <input
                value={n.perdeSeAqui}
                onChange={(e) => mudar(i, "perdeSeAqui", e.target.value)}
                placeholder="Porque é que se perde gente deste degrau para o seguinte"
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
              />
            </label>

            <fieldset className="mt-2">
              <legend className="text-xs font-medium text-slate-700">
                Contam para este degrau
              </legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {estados.filter((e) => e.activo && !e.terminal).map((e) => {
                  const ligado = n.estados.includes(e.chave);
                  return (
                    <button
                      key={e.chave}
                      type="button"
                      onClick={() => alternarEstado(i, e.chave)}
                      aria-pressed={ligado}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
                        ligado
                          ? "bg-slate-900 text-white ring-slate-900"
                          : "bg-white text-slate-600 ring-slate-300 hover:ring-slate-500"
                      }`}
                    >
                      {e.nome}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={aGravar}
          onClick={() =>
            gravar(async () => {
              const r = await guardarNiveis(niveis, alvo);
              setRecado({ ok: r.ok, texto: r.ok ? "Funil gravado." : r.mensagem });
            })
          }
        >
          {aGravar && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
          Guardar o funil
        </Button>

        <Button
          type="button" variant="outline" disabled={aGravar}
          onClick={() =>
            setNiveis([
              ...niveis,
              {
                chave: `degrau_${Date.now().toString(36)}`,
                ordem: niveis.length + 1,
                nome: "Degrau novo",
                perdeSeAqui: "",
                taxaPrevista: 80,
                cor: "#64748b",
                estados: [],
                activo: true,
              },
            ])
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Acrescentar degrau
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
