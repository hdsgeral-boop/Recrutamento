"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { nomesDosParametros, numerosVisiveis, OPCOES_POR_PAGINA, type Fatia } from "@/lib/paginacao";

/**
 * Barra de paginação. Escreve no endereço, por isso funciona com o botão de
 * voltar do browser e mantém-se ao recarregar a página.
 *
 * Mudar o número de linhas por página volta sempre à primeira - senão o
 * utilizador que estava na página 9 de 10 linhas cairia numa página vazia ao
 * passar para 100.
 */
export function Paginacao({ fatia, nome = "resultado" }: { fatia: Fatia; nome?: string }) {
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();
  const [aCarregar, iniciar] = useTransition();

  const ir = useCallback(
    (mudancas: Record<string, string | null>) => {
      const p = new URLSearchParams(parametros.toString());
      Object.entries(mudancas).forEach(([k, v]) => (v === null ? p.delete(k) : p.set(k, v)));
      iniciar(() => router.push(p.toString() ? `${caminho}?${p}` : caminho, { scroll: false }));
    },
    [parametros, caminho, router]
  );

  const { pagina, porPagina, totalPaginas, inicio, fim, total } = fatia;
  // Cada lista escreve nos SEUS parâmetros. Sem isto, duas listas paginadas na
  // mesma página mexiam uma na outra.
  const chaves = nomesDosParametros(fatia.prefixo);

  if (total === 0) return null;

  const plural = total === 1 ? nome : `${nome}s`;

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      {/* Contagem e escolha do tamanho da página */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">
            {inicio + 1}-{fim}
          </strong>{" "}
          de <strong className="text-foreground">{total}</strong> {plural}
        </span>

        {aCarregar && <Loader2 className="h-3.5 w-3.5 animate-spin" />}

        <span className="ml-2 flex items-center gap-1.5">
          <span className="hidden sm:inline">Mostrar</span>
          <Select
            value={String(porPagina)}
            onValueChange={(v) => ir({ [chaves.porPagina]: v, [chaves.pagina]: null })}
          >
            <SelectTrigger className="h-8 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPCOES_POR_PAGINA.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="hidden sm:inline">por página</span>
        </span>
      </div>

      {/* Navegação */}
      {totalPaginas > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={pagina <= 1}
            onClick={() => ir({ [chaves.pagina]: pagina - 1 === 1 ? null : String(pagina - 1) })}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {numerosVisiveis(pagina, totalPaginas).map((n, i) =>
            n === "..." ? (
              <span key={`e${i}`} className="px-1 text-sm text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => ir({ [chaves.pagina]: n === 1 ? null : String(n) })}
                aria-current={n === pagina ? "page" : undefined}
                className={cn(
                  "h-8 min-w-8 rounded-md border px-2 text-sm font-medium transition-colors",
                  n === pagina
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary"
                )}
              >
                {n}
              </button>
            )
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={pagina >= totalPaginas}
            onClick={() => ir({ [chaves.pagina]: String(pagina + 1) })}
            aria-label="Página seguinte"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
