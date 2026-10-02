import { Info } from "lucide-react";

import {
  BARRAS,
  DESCRICAO_ALERTA,
  ESCALAO_ELIMINADO,
  ESCALAO_POR_ANALISAR,
  ESCALOES,
  GRAVIDADES,
  TIPOS_DE_ALERTA,
} from "@/lib/ranking/apresentacao";

/**
 * Legenda do ranking. Usa <details>, por isso abre e fecha sem JavaScript
 * nenhum e continua a funcionar se a página for impressa.
 *
 * Regra desta legenda: TODA a descrição tem o seu símbolo de cor ao lado.
 * Uma explicação sem a cor ao lado obriga a pessoa a fazer a correspondência
 * de cabeça, e é aí que se lê o ranking ao contrário.
 */

/** Linha da legenda: símbolo colorido à esquerda, explicação à direita. */
function Linha({
  simbolo,
  titulo,
  extra,
  texto,
}: {
  simbolo: React.ReactNode;
  titulo: string;
  extra?: string;
  texto: string;
}) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-1 flex w-6 shrink-0 justify-center">{simbolo}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold">
          {titulo}
          {extra && <span className="ml-1.5 font-normal text-muted-foreground">{extra}</span>}
        </p>
        <p className="text-xs leading-snug text-muted-foreground">{texto}</p>
      </div>
    </li>
  );
}

export function LegendaRanking() {
  return (
    <details open className="no-print group rounded-xl border bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm font-semibold sm:px-4">
        <Info className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="min-w-0">Como ler esta tabela: cores, barras e alertas</span>
        <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground group-open:hidden">
          mostrar
        </span>
        <span className="ml-auto hidden shrink-0 text-xs font-normal text-muted-foreground group-open:inline">
          esconder
        </span>
      </summary>

      <div className="grid gap-5 border-t px-3 py-4 sm:px-4 lg:grid-cols-3">
        {/* ------------------------------------------------ ESCALÕES DA COR */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cor da pontuação
          </h3>
          <ul className="space-y-2">
            {[...ESCALOES, ESCALAO_ELIMINADO, ESCALAO_POR_ANALISAR].map((e) => (
              <Linha
                key={e.rotulo}
                simbolo={
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${e.cor}`}
                  >
                    {e.min >= 0 ? e.min : "-"}
                  </span>
                }
                titulo={e.rotulo}
                extra={e.min >= 0 ? `${e.min} pontos ou mais` : undefined}
                texto={e.descricao}
              />
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------- AS 3 BARRAS */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            As três barras
          </h3>
          <ul className="space-y-2">
            {BARRAS.map((b) => (
              <Linha
                key={b.chave}
                simbolo={<span className={`mt-1 block h-2 w-6 rounded-full ${b.cor}`} />}
                titulo={b.rotulo}
                extra={`até ${b.maximo} pontos`}
                texto={b.descricao}
              />
            ))}
          </ul>
          <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs leading-snug text-muted-foreground">
            Os restantes 35 pontos - literacia digital, carta de condução, atendimento ao público e
            completude da candidatura - não têm barra própria, mas contam para o total. A ficha de
            cada candidato mostra os dez critérios um a um.
          </p>
        </section>

        {/* ------------------------------------------------------- ALERTAS */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Alertas
          </h3>

          <ul className="mb-3 space-y-2">
            {(["grave", "aviso", "info"] as const).map((g) => (
              <Linha
                key={g}
                simbolo={
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${GRAVIDADES[g].cor}`}
                  >
                    !
                  </span>
                }
                titulo={GRAVIDADES[g].rotulo}
                texto={GRAVIDADES[g].explicacao}
              />
            ))}
          </ul>

          <p className="mb-2 text-xs font-semibold text-muted-foreground">Tipos que aparecem</p>
          <ul className="space-y-2">
            {TIPOS_DE_ALERTA.map((t) => (
              <Linha
                key={t.tipo}
                simbolo={
                  <span
                    className={`mt-1 block h-2.5 w-2.5 rounded-full ${GRAVIDADES[t.gravidade].ponto}`}
                  />
                }
                titulo={t.nome}
                texto={DESCRICAO_ALERTA[t.tipo]}
              />
            ))}
          </ul>
        </section>
      </div>

      <p className="border-t bg-slate-50 px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
        Passa o rato por cima da pontuação, das barras ou do crachá de alertas de qualquer linha
        para veres o resumo daquele candidato em concreto. No telemóvel, toca.
      </p>
    </details>
  );
}
