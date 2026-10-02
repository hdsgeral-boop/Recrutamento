"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Separadores da área de Entrevistas.
 *
 * Rolam de lado em ecrã estreito em vez de quebrarem para três linhas: uma
 * fila de separadores que passa a bloco empurra o conteúdo todo para baixo e
 * faz perder a noção de onde se está.
 */
interface Separador {
  href: string;
  rotulo: string;
  exacto?: boolean;
}

const BASE: Separador[] = [
  { href: "/admin/entrevistas", rotulo: "Visão geral", exacto: true },
  { href: "/admin/entrevistas/agendadas", rotulo: "Agendadas" },
  { href: "/admin/entrevistas/decorrer", rotulo: "Em entrevista" },
  { href: "/admin/entrevistas/atrasadas", rotulo: "Atrasadas" },
  { href: "/admin/entrevistas/concluidas", rotulo: "Concluídas" },
  { href: "/admin/entrevistas/resultados", rotulo: "Resultados" },
];

const SO_GESTAO: Separador[] = [
  { href: "/admin/entrevistas/atribuicao", rotulo: "Atribuição" },
  { href: "/admin/entrevistas/perguntas", rotulo: "Perguntas" },
];

export function SeparadoresEntrevistas({ gere }: { gere: boolean }) {
  const caminho = usePathname();
  const separadores = gere ? [...BASE, ...SO_GESTAO] : BASE;

  return (
    <nav className="-mx-1 overflow-x-auto pb-1">
      <div className="flex w-max min-w-full gap-1 border-b px-1">
        {separadores.map((s) => {
          const activo = s.exacto ? caminho === s.href : caminho.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                activo
                  ? "border-consulvolt-vermelho text-consulvolt-vermelho"
                  : "border-transparent text-muted-foreground hover:border-slate-300 hover:text-slate-900"
              )}
            >
              {s.rotulo}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
