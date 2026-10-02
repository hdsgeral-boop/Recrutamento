"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, ScanLine, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { lerDemografiaDosBis } from "@/app/admin/accoes-demografia";

/**
 * Manda o sistema reler os BIs já digitalizados à procura do sexo e da data de
 * nascimento. Não corre OCR: o texto já está guardado desde a análise dos
 * documentos, por isso isto é instantâneo e não custa nada.
 */
export function BotaoLerBis() {
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [aCorrer, correr] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={aCorrer}
        onClick={() =>
          correr(async () => {
            setRecado(null);
            const r = await lerDemografiaDosBis();
            setRecado({ ok: r.ok, texto: r.mensagem });
          })
        }
      >
        {aCorrer ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <ScanLine className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        )}
        Ler os BIs
      </Button>

      {recado && (
        <p
          className={`flex max-w-md items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${
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
    </div>
  );
}
