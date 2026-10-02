"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Interruptor de ligar/desligar.
 *
 * Escrito à mão, sem dependência nova: é um <button role="switch">, que é
 * exactamente o que os leitores de ecrã esperam, e responde ao espaço e ao
 * enter como qualquer botão.
 */
export const Interruptor = React.forwardRef<
  HTMLButtonElement,
  {
    id?: string;
    ligado: boolean;
    aoMudar: (valor: boolean) => void;
    desactivado?: boolean;
    /** Descrição para quem não vê o rótulo ao lado. */
    rotulo?: string;
    className?: string;
  }
>(({ id, ligado, aoMudar, desactivado, rotulo, className }, ref) => (
  <button
    ref={ref}
    id={id}
    type="button"
    role="switch"
    aria-checked={ligado}
    aria-label={rotulo}
    disabled={desactivado}
    onClick={() => aoMudar(!ligado)}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      ligado ? "bg-emerald-500" : "bg-slate-300",
      className
    )}
  >
    <span
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
        ligado ? "translate-x-[1.375rem]" : "translate-x-0.5"
      )}
    />
  </button>
));
Interruptor.displayName = "Interruptor";
