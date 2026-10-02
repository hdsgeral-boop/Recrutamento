"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Calculator, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { recalcularPontuacoes, type ResultadoRecalculo } from "@/app/admin/accoes-recalculo";

/**
 * ===========================================================================
 * RECALCULAR AS NOTAS DAS ENTREVISTAS JÁ FEITAS
 * ---------------------------------------------------------------------------
 * Dois passos, e não um. Primeiro mostra-se o que mudaria, nome a nome, com o
 * antes e o depois; só depois é que se grava.
 *
 * Mexer nas notas de toda a gente de uma vez é das coisas mais difíceis de
 * desfazer que este painel faz. Quem carrega tem de poder ver o estrago antes
 * de o fazer - e, na maior parte das vezes, vai ver que não há estrago
 * nenhum e fica descansado sem gravar nada.
 * ===========================================================================
 */
export function RecalcularPontuacao() {
  const router = useRouter();
  const [aCorrer, setACorrer] = useState(false);
  const [previa, setPrevia] = useState<ResultadoRecalculo | null>(null);

  async function simular() {
    setACorrer(true);
    try {
      const r = await recalcularPontuacoes(false);
      if (!r.ok) return toast.error(r.mensagem);
      setPrevia(r);
      if (r.mudadas.length === 0) toast.success(r.mensagem);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não consegui recalcular.");
    } finally {
      setACorrer(false);
    }
  }

  async function aplicar() {
    if (
      !window.confirm(
        `Vais mudar a nota de ${previa?.mudadas.length} entrevista(s). ` +
          "As marcações do entrevistador não se tocam: só o número calculado a partir delas. Continuar?"
      )
    )
      return;

    setACorrer(true);
    try {
      const r = await recalcularPontuacoes(true);
      r.ok ? toast.success(r.mensagem) : toast.error(r.mensagem);
      setPrevia(null);
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não consegui gravar.");
    } finally {
      setACorrer(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-3 py-3 sm:px-4">
        <Calculator className="h-4 w-4 shrink-0 text-consulvolt-vermelho" />
        <h2 className="text-sm font-semibold">Recalcular pontuação</h2>

        <Button
          size="sm"
          variant="outline"
          onClick={simular}
          disabled={aCorrer}
          className="ml-auto"
        >
          {aCorrer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
          <span className="ml-1.5">{aCorrer ? "A calcular" : "Verificar as notas"}</span>
        </Button>
      </header>

      <div className="space-y-3 p-3 sm:p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          A nota da entrevista é a soma dos pontos de cada pergunta, em 100. As entrevistas
          gravadas antes desta regra ficaram com um número calculado de outra maneira. Isto
          volta a pontuá-las <strong>com o roteiro com que cada uma foi feita</strong>, sem
          tocar em nenhuma marcação do entrevistador.
        </p>

        {previa && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-700">
              {previa.lidas} entrevista(s) lidas. {previa.iguais} já estavam certas.
              {previa.mudadas.length > 0 && ` ${previa.mudadas.length} mudam de nota.`}
            </p>

            {previa.saltadas.length > 0 && (
              <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {previa.saltadas.map((s) => `${s.quantas} com a versão ${s.versao}`).join(", ")}{" "}
                  ficam como estão: esse roteiro já não existe, e pontuá-las com as perguntas
                  de outro dava uma nota errada.
                </span>
              </p>
            )}

            {previa.mudadas.length > 0 && (
              <>
                <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
                  {previa.mudadas.map((m) => (
                    <li
                      key={m.candidatoId + m.versao}
                      className="flex flex-wrap items-center gap-2 px-2.5 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                        {m.nome}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {m.versao}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {m.respondidas}/{m.totalPerguntas} marcadas
                      </span>
                      <span className="flex items-center gap-1.5 font-mono tabular-nums">
                        <span className="text-slate-400 line-through">{m.antes}</span>
                        <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden />
                        <span
                          className={cn(
                            "font-bold",
                            m.depois > m.antes ? "text-emerald-700" : "text-rose-700"
                          )}
                        >
                          {m.depois}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <Button onClick={aplicar} disabled={aCorrer}>
                  {aCorrer ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span className={aCorrer ? "ml-2" : ""}>
                    Gravar as {previa.mudadas.length} notas novas
                  </span>
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
