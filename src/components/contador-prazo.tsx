"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

interface Restante {
  dias: number;
  horas: number;
  minutos: number;
  segundos: number;
  terminou: boolean;
}

function calcular(prazo: number): Restante {
  const diferenca = prazo - Date.now();

  if (diferenca <= 0) return { dias: 0, horas: 0, minutos: 0, segundos: 0, terminou: true };

  return {
    dias: Math.floor(diferenca / 86400000),
    horas: Math.floor((diferenca / 3600000) % 24),
    minutos: Math.floor((diferenca / 60000) % 60),
    segundos: Math.floor((diferenca / 1000) % 60),
    terminou: false,
  };
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Uma caixinha com o número e a legenda por baixo. */
function Bloco({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="flex min-w-[2.6rem] flex-col items-center rounded-md bg-white/10 px-1.5 py-1">
      <span className="font-mono text-base font-bold leading-none tabular-nums sm:text-lg">
        {valor}
      </span>
      <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400">{etiqueta}</span>
    </div>
  );
}

/**
 * Contador regressivo até ao fecho das candidaturas.
 * Só arranca depois de o componente montar no browser, senão o HTML gerado
 * no servidor e o do cliente não coincidem e o React queixa-se.
 */
export function ContadorPrazo({ prazo }: { prazo: string }) {
  const [restante, setRestante] = useState<Restante | null>(null);

  useEffect(() => {
    const alvo = new Date(prazo).getTime();
    if (Number.isNaN(alvo)) return;

    setRestante(calcular(alvo));
    const relogio = setInterval(() => setRestante(calcular(alvo)), 1000);
    return () => clearInterval(relogio);
  }, [prazo]);

  // Espaço reservado enquanto o relógio não arranca, para o cabeçalho não saltar.
  if (!restante) {
    return <div className="h-[46px] w-[13rem]" aria-hidden />;
  }

  if (restante.terminou) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-consulvolt-vermelho/90 px-3 py-2">
        <CalendarClock className="h-4 w-4 shrink-0" />
        <div className="leading-tight">
          <p className="text-xs font-semibold">Candidaturas encerradas</p>
          <p className="text-[10px] text-white/80">O prazo para submeter terminou</p>
        </div>
      </div>
    );
  }

  const urgente = restante.dias < 2;

  return (
    <div
      className={`rounded-lg px-3 py-1.5 ${urgente ? "bg-consulvolt-vermelho/90" : "bg-white/5"}`}
      role="timer"
      aria-label={`Faltam ${restante.dias} dias, ${restante.horas} horas e ${restante.minutos} minutos para o fecho das candidaturas`}
    >
      <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-300">
        <CalendarClock className="h-3 w-3" />
        Candidaturas fecham em
      </p>
      <div className="flex items-center gap-1">
        <Bloco valor={String(restante.dias)} etiqueta={restante.dias === 1 ? "dia" : "dias"} />
        <Bloco valor={doisDigitos(restante.horas)} etiqueta="horas" />
        <Bloco valor={doisDigitos(restante.minutos)} etiqueta="min" />
        <Bloco valor={doisDigitos(restante.segundos)} etiqueta="seg" />
      </div>
    </div>
  );
}
