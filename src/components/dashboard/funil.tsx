import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

import { largurasDaPiramide, maiorPerda, type LinhaFunil } from "@/lib/funil/calcular";
import { corDoDegrau, ESTADO, numero, tintaSobre } from "@/components/dashboard/paleta";

/**
 * ===========================================================================
 * A PIRÂMIDE DO RECRUTAMENTO
 * ---------------------------------------------------------------------------
 * Sete degraus, das candidaturas ao contrato assinado, desenhados como o que
 * são: uma base larga que se estreita até ao topo. A largura de cada degrau é
 * a dos PRECISOS - quantas pessoas é preciso ter ali para o alvo se cumprir -
 * e por dentro há uma barra de progresso com quantas lá estão mesmo.
 *
 * Porque é que a largura é o previsto e não o real: o previsto é a forma do
 * plano, e é essa forma que se quer ver de relance. O real entra como
 * enchimento, e a diferença entre os dois lê-se sem se ler um único número.
 *
 * A cor é uma rampa ordinal de um tom só - ver `paleta.ts` para a razão. A
 * única cor que carrega significado é a do desvio entre a taxa real e a
 * prevista, e essa vem sempre com o número e uma seta ao lado.
 * ===========================================================================
 */

/** Quão longe está a taxa real da prevista, traduzido em estado. */
function estadoDoDesvio(desvio: number | null): { cor: string; rotulo: string } | null {
  if (desvio === null) return null;
  if (desvio >= 0) return { cor: ESTADO.bom, rotulo: "acima do previsto" };
  if (desvio >= -10) return { cor: ESTADO.aviso, rotulo: "ligeiramente abaixo" };
  return { cor: ESTADO.critico, rotulo: "bem abaixo do previsto" };
}


export function Funil({ linhas, alvo }: { linhas: LinhaFunil[]; alvo: number }) {
  if (linhas.length === 0) return null;

  const base = linhas[0]?.precisos ?? 0;
  const gargalo = maiorPerda(linhas);
  const total = linhas.length;
  const larguras = largurasDaPiramide(linhas.map((l) => l.precisos));

  // Do topo (o último degrau, o mais estreito) para a base.
  const doTopo = [...linhas].reverse();

  return (
    <section className="rounded-xl border bg-white">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Pirâmide do recrutamento</h2>
        <p className="text-xs text-muted-foreground">
          Sete níveis, das candidaturas ao contrato assinado. A largura de cada degrau é o que é
          preciso ter lá para chegar a {alvo} contratação(ões); o enchimento é o que lá está agora.
          As taxas previstas editam-se em Definições.
        </p>
      </header>

      {gargalo && (
        <p className="flex items-start gap-2 border-b bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            É em <strong>{gargalo.nivel.nome}</strong> que se perde mais gente:{" "}
            <strong>{gargalo.perdidos}</strong> candidatura(s). {gargalo.nivel.perdeSeAqui}.
          </span>
        </p>
      )}

      {/* ------------------------------------------------------- A PIRÂMIDE */}
      <ol className="flex flex-col items-center gap-0 px-3 py-4 sm:px-4">
        {doTopo.map((l, i) => {
          // O índice a contar de baixo, para a rampa escurecer ao subir.
          const deBaixo = total - 1 - i;
          const cor = corDoDegrau(deBaixo, total);
          const tinta = tintaSobre(cor);
          const largura = larguras[deBaixo] ?? 100;
          const enchimento = l.precisos > 0 ? Math.min(100, (l.tem / l.precisos) * 100) : 0;
          const est = estadoDoDesvio(l.desvio);
          const numeroDoDegrau = deBaixo + 1;

          return (
            <li key={l.nivel.chave} className="w-full">
              {/* A passagem para o degrau de cima, entre um e outro. */}
              {i > 0 && (
                <p className="py-1 text-center text-[11px] text-muted-foreground">
                  <span aria-hidden>▲</span>{" "}
                  {l.nivel.taxaPrevista !== null ? (
                    <>passam {numero(l.nivel.taxaPrevista)}%</>
                  ) : (
                    <>entrada</>
                  )}
                  {l.taxaReal !== null ? (
                    <>
                      {" · "}
                      <span className="font-semibold" style={{ color: est?.cor }}>
                        {est &&
                          (l.desvio !== null && l.desvio >= 0 ? (
                            <TrendingUp className="mr-0.5 inline h-3 w-3" aria-hidden />
                          ) : (
                            <TrendingDown className="mr-0.5 inline h-3 w-3" aria-hidden />
                          ))}
                        medido {numero(l.taxaReal)}%
                      </span>
                    </>
                  ) : (
                    <> · por medir</>
                  )}
                </p>
              )}

              <div
                className="relative mx-auto overflow-hidden rounded-lg transition-[width]"
                style={{ width: `${largura}%`, backgroundColor: cor }}
              >
                {/* O que FALTA fica lavado a branco; o que já está lá fica com
                    a cor cheia. Ao contrário lia-se ao contrário: a parte
                    conseguida é que tem de parecer sólida. */}
                <span
                  className="absolute inset-y-0 right-0 bg-white/55"
                  style={{ width: `${100 - enchimento}%` }}
                  aria-hidden
                />

                <div
                  className="relative flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
                  style={{ color: tinta }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{ backgroundColor: tinta === "#ffffff" ? "rgba(255,255,255,.22)" : "rgba(15,23,42,.12)" }}
                    aria-hidden
                  >
                    {numeroDoDegrau}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-tight">{l.nivel.nome}</span>
                    {l.nivel.perdeSeAqui && (
                      <span className="block text-[11px] leading-snug opacity-85">
                        {l.nivel.perdeSeAqui}
                      </span>
                    )}
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-base font-bold leading-none tabular-nums">
                      {l.tem}
                      <span className="text-xs font-normal opacity-80"> de {l.precisos}</span>
                    </span>
                    {l.faltam > 0 ? (
                      <span className="block text-[11px] font-semibold tabular-nums opacity-90">
                        faltam {l.faltam}
                      </span>
                    ) : (
                      <span className="block text-[11px] font-semibold opacity-90">completo</span>
                    )}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* ------------------------------------------------------- O REMATE */}
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">
        <strong className="text-slate-900">Alvo: {alvo} pessoa(s) contratada(s).</strong> Com as
        taxas de passagem definidas, isso pede{" "}
        <strong className="text-slate-900">{base.toLocaleString("pt-PT")}</strong> candidatura(s) na
        base. Estão <strong className="text-slate-900">{linhas[0]?.tem ?? 0}</strong>
        {(linhas[0]?.faltam ?? 0) > 0 && (
          <>
            {" - "}
            <strong className="text-rose-700">faltam {linhas[0]?.faltam}</strong>
          </>
        )}
        . As taxas são uma estimativa: a coluna «medido» mostra a medida real assim que houver gente
        nos dois níveis, e é essa que deve substituir a suposição.
      </p>
    </section>
  );
}
