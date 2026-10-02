"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { testarLigacaoCalendar } from "@/app/admin/accoes-calendar";

/**
 * O botão que confirma se as salas do Meet vão mesmo ser criadas.
 *
 * Existe para a resposta a «isto está configurado?» ser um teste e não uma
 * suposição. Quem monta a ligação carrega aqui e sabe, em vez de descobrir na
 * manhã da primeira jornada de entrevistas.
 */
export function TesteCalendar() {
  const [r, setR] = useState<{ ok: boolean; texto: string } | null>(null);
  const [aCorrer, correr] = useTransition();

  return (
    <section className="rounded-xl border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-consulvolt-vermelho" aria-hidden />
          <div className="min-w-0">
            <h2 className="font-semibold">Salas de videochamada</h2>
            <p className="text-sm text-muted-foreground">
              Quando a marcação corre com «criar uma sala por candidato», o sistema pede ao Google
              Calendar uma sala do Meet para cada entrevista, à hora dela. O passo a passo para
              ligar está no ficheiro <strong>GOOGLE-CALENDAR.md</strong> do repositório.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={aCorrer}
          onClick={() =>
            correr(async () => {
              setR(null);
              const d = await testarLigacaoCalendar();
              setR({ ok: d.ok, texto: d.mensagem });
            })
          }
        >
          {aCorrer ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <CalendarCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Testar a ligação
        </Button>
      </div>

      {r && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            r.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
          }`}
          role="status"
        >
          {r.ok ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          {r.texto}
        </p>
      )}
    </section>
  );
}
