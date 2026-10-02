"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Play, Timer } from "lucide-react";

import { cn } from "@/lib/utils";
import { estadoDoRelogio } from "@/lib/entrevista/relogio";
import { dataFutura, minimoParaInput } from "@/lib/entrevista/quando";

/**
 * O relógio que o entrevistador vê.
 *
 * Conta de segundo a segundo no browser a partir do instante em que a
 * entrevista foi marcada como começada - guardado no servidor, não aqui.
 * Recarregar a página não reinicia a contagem, e é por isso que o início tem
 * de vir de fora.
 *
 * Sem duração definida na marcação, não há relógio nenhum: inventar trinta
 * minutos seria pôr uma pressão que ninguém decidiu.
 */
export function RelogioEntrevista({
  inicio,
  fim,
  terminada,
  duracaoMinutos,
  aComecar,
  comecar,
}: {
  inicio: string | null;
  /** Quando a entrevista foi dada por concluída. Daí em diante não conta. */
  fim: string | null;
  /**
   * O processo está fechado, mesmo que não se saiba a hora exacta.
   *
   * É o travão de segurança para as entrevistas antigas, fechadas quando o
   * sistema ainda não carimbava o fim. Sem hora não se pode dizer quanto
   * durou - mas pode-se, e deve-se, deixar de contar. Um relógio a somar
   * minutos numa entrevista de há três semanas não informa ninguém.
   */
  terminada?: boolean;
  duracaoMinutos: number | null;
  aComecar: boolean;
  comecar: () => void;
}) {
  /**
   * O tempo só entra DEPOIS de montar, e isso é deliberado.
   *
   * O servidor desenha esta página num instante e o browser noutro. Se o
   * relógio fosse calculado logo na primeira renderização, o HTML do servidor
   * e o do browser diziam segundos diferentes, o React dava desencontro de
   * hidratação e deitava fora a árvore toda para a desenhar de novo. Antes de
   * montar mostra-se um traço, que é igual dos dois lados.
   */
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    if (!inicio || !duracaoMinutos) return;
    setAgora(Date.now());

    // Com a entrevista acabada não se liga tique nenhum. Deixar um intervalo
    // a correr para desenhar sempre o mesmo número gastava bateria a fingir
    // que ainda havia contagem.
    if (fim || terminada) return;

    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [inicio, duracaoMinutos, fim, terminada]);

  if (!duracaoMinutos) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Timer className="h-3.5 w-3.5" />
        Sem tempo definido na marcação
      </span>
    );
  }

  // Marcada com duração, mas ainda não começou: o botão é que arranca o
  // relógio, e a partir daí a contagem é do servidor.
  if (!inicio) {
    return (
      <button
        type="button"
        onClick={comecar}
        disabled={aComecar}
        className="flex items-center gap-1.5 rounded-md bg-consulvolt-vermelho px-2.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Play className="h-3.5 w-3.5" />
        Começar ({duracaoMinutos} min)
      </button>
    );
  }

  // Antes de montar não há hora: mostra-se a duração parada, igual nos dois
  // lados, e a contagem entra no primeiro tique.
  const r =
    agora === null
      ? {
          texto: "--:--",
          fraccao: 0,
          fase: "a-correr" as const,
          segundos: 0,
          inactivo: false,
          parado: false,
          duracaoReal: null,
        }
      : estadoDoRelogio(inicio, duracaoMinutos, agora, fim);

  // Fechada mas sem hora de fim: uma das antigas, de quando o sistema ainda
  // não carimbava nada. Não se inventa uma duração; diz-se que acabou e
  // pára-se de contar, que é o que falta.
  if (terminada && !r.parado) {
    return (
      <div className="flex min-w-[132px] flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <span className="font-mono text-lg font-bold tabular-nums leading-none text-slate-400">
            --:--
          </span>
          <span className="text-[10px] text-muted-foreground">de {duracaoMinutos} min</span>
        </div>
        <span className="text-[10px] font-medium text-emerald-700">
          Entrevista terminada. A hora de fim não ficou registada.
        </span>
      </div>
    );
  }

  // Acabada, isto deixa de ser um cronómetro e passa a ser um facto: quanto
  // tempo a entrevista durou. Por isso muda de cor, de ícone e de legenda -
  // ninguém deve ficar a olhar para um número a pensar se ainda está a andar.
  if (r.parado) {
    return (
      <div className="flex min-w-[132px] flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <span className="font-mono text-lg font-bold tabular-nums leading-none text-slate-700">
            {r.texto}
          </span>
          <span className="text-[10px] text-muted-foreground">de {duracaoMinutos} min</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-slate-400" style={{ width: `${r.fraccao * 100}%` }} />
        </div>
        <span className="text-[10px] font-medium text-emerald-700">
          Entrevista terminada. Foi o tempo que durou.
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-[132px] flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Timer
          className={cn(
            "h-4 w-4 shrink-0",
            r.fase === "esgotado" ? "text-rose-600" : r.fase === "a-acabar" ? "text-amber-600" : "text-slate-500"
          )}
        />
        <span
          className={cn(
            "font-mono text-lg font-bold tabular-nums leading-none",
            r.fase === "esgotado"
              ? "text-rose-600"
              : r.fase === "a-acabar"
                ? "text-amber-600"
                : "text-slate-800"
          )}
        >
          {r.texto}
        </span>
        <span className="text-[10px] text-muted-foreground">
          de {duracaoMinutos} min
        </span>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full transition-all duration-1000",
            r.fase === "esgotado" ? "bg-rose-500" : r.fase === "a-acabar" ? "bg-amber-500" : "bg-emerald-500"
          )}
          style={{ width: `${r.fraccao * 100}%` }}
        />
      </div>

      {r.fase === "esgotado" && (
        <span className="text-[10px] font-medium text-rose-600">
          Passou do tempo previsto
        </span>
      )}
    </div>
  );
}

/** O bloco de reagendar, dentro da entrevista. */
export function CaixaReagendar({
  aberta,
  fechar,
  valorInicial,
  duracaoInicial,
  reagendar,
  aCorrer,
}: {
  aberta: boolean;
  fechar: () => void;
  valorInicial: string;
  duracaoInicial: number | null;
  reagendar: (quando: string, duracao: number | null, motivo: string) => void;
  aCorrer: boolean;
}) {
  const [quando, setQuando] = useState(valorInicial);
  const [duracao, setDuracao] = useState(duracaoInicial ?? 30);
  const [motivo, setMotivo] = useState("");

  // A caixa abre com a data ANTIGA lá dentro, que muitas vezes já passou.
  // Carregar sem pensar era o engano mais fácil de cometer aqui.
  const valida = quando ? dataFutura(new Date(quando).toISOString()).ok : false;

  if (!aberta) return null;

  return (
    <div className="space-y-2.5 border-b bg-amber-50 px-3 py-3 sm:px-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
        <CalendarClock className="h-3.5 w-3.5" />
        Reagendar esta entrevista
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          type="datetime-local"
          value={quando}
          min={minimoParaInput()}
          onChange={(e) => setQuando(e.target.value)}
          className={cn(
            "h-9 rounded-md border bg-white px-2 text-sm",
            quando && !valida ? "border-rose-400 text-rose-800" : "border-input"
          )}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={5}
            max={240}
            step={5}
            value={duracao}
            onChange={(e) => setDuracao(Number(e.target.value))}
            className="h-9 w-[76px] rounded-md border border-input bg-white px-2 text-center text-sm"
          />
          <span className="text-xs text-amber-900">min</span>
        </div>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (fica no histórico)"
          className="h-9 min-w-[160px] flex-1 rounded-md border border-input bg-white px-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={aCorrer || !quando || !valida}
          onClick={() => reagendar(quando, duracao, motivo)}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Reagendar
        </button>
        <button
          type="button"
          onClick={fechar}
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900"
        >
          Deixar como está
        </button>

        <span className="text-[11px] text-amber-800">
          {quando && !valida ? (
            <strong className="text-rose-700">
              Essa data já passou. Escolhe uma data futura.
            </strong>
          ) : (
            <>
              As marcações que já fizeste ficam. O candidato não é avisado daqui - manda-lhe um
              lembrete em Comunicações.
            </>
          )}
        </span>
      </div>
    </div>
  );
}
