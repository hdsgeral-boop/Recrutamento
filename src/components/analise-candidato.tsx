"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Info, Loader2, OctagonAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reanalisar } from "@/app/admin/accoes-analise";
import { DESCRICAO_ALERTA, GRAVIDADES } from "@/lib/ranking/apresentacao";
import type { Alerta, ResultadoPontuacao } from "@/lib/ranking/tipos";

const CORES_ALERTA = {
  info: { fundo: "bg-slate-50 border-slate-200", texto: "text-slate-700", icone: Info },
  aviso: { fundo: "bg-amber-50 border-amber-200", texto: "text-amber-800", icone: AlertTriangle },
  grave: { fundo: "bg-rose-50 border-rose-200", texto: "text-rose-800", icone: OctagonAlert },
} as const;

/** Botão que força uma nova análise, mesmo sem os anexos terem mudado. */
export function BotaoReanalisar({ id }: { id: string }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={aCorrer}
      onClick={() =>
        iniciar(async () => {
          const r = await reanalisar(id);
          r.ok ? toast.success(r.mensagem) : toast.error(r.mensagem);
          router.refresh();
        })
      }
    >
      {aCorrer ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {aCorrer ? "A analisar…" : "Reanalisar"}
    </Button>
  );
}

/** Lista de alertas, ordenada por gravidade. */
export function ListaAlertas({ alertas }: { alertas: Alerta[] }) {
  if (!alertas?.length) return null;

  const ordem = { grave: 0, aviso: 1, info: 2 } as const;
  const ordenados = [...alertas].sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);

  return (
    <ul className="space-y-2">
      {ordenados.map((a, i) => {
        const estilo = CORES_ALERTA[a.gravidade];
        const Icone = estilo.icone;
        return (
          <li
            key={`${a.tipo}-${i}`}
            className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${estilo.fundo} ${estilo.texto}`}
          >
            <Icone className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>
                <span className="font-semibold">{GRAVIDADES[a.gravidade].rotulo}:</span>{" "}
                {a.mensagem}
              </p>
              {/* O que este tipo de alerta quer dizer, para quem vê o painel
                  pela primeira vez não ter de adivinhar. */}
              <p className="mt-1 text-xs opacity-75">{DESCRICAO_ALERTA[a.tipo]}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Desdobramento da pontuação, critério a critério, com a citação de apoio. */
export function DesdobramentoPontuacao({ detalhe }: { detalhe: ResultadoPontuacao }) {
  return (
    <div className="space-y-2">
      {detalhe.criterios.map((c) => {
        const percentagem = c.maximo > 0 ? (c.pontos / c.maximo) * 100 : 0;

        return (
          <div key={c.codigo} className="rounded-lg border bg-white p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                <span className="mr-2 font-mono text-xs text-muted-foreground">{c.codigo}</span>
                {c.nome}
              </p>
              <p className="font-mono text-sm font-bold tabular-nums">
                {c.pontos}
                <span className="text-xs font-normal text-muted-foreground">/{c.maximo}</span>
              </p>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-consulvolt-vermelho transition-all"
                style={{ width: `${percentagem}%` }}
              />
            </div>

            <p className="mt-2 text-xs text-muted-foreground">{c.banda}</p>

            {c.evidencia ? (
              <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-xs italic text-slate-600">
                &ldquo;{c.evidencia}&rdquo;
              </blockquote>
            ) : (
              <p className="mt-1.5 text-[11px] uppercase tracking-wide text-slate-400">
                {c.origem === "formulario"
                  ? "Do formulário"
                  : c.origem === "ambos"
                    ? "Formulário e documentos"
                    : "Sem citação nos documentos"}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
