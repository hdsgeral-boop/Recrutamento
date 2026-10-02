"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, FolderKanban, Layers, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { definirConcursoActivo } from "@/app/admin/accoes-concursos";

export interface ItemSelectorConcurso {
  id: string;
  slug: string;
  nome: string;
  vagaTitulo: string;
  estado: string;
  totalCandidatos: number;
}

export function ConcursoSelector({
  concursoActivoSlug,
  concursos,
}: {
  concursoActivoSlug: string;
  concursos: ItemSelectorConcurso[];
}) {
  const router = useRouter();
  const [aMudar, startTransition] = useTransition();

  const concursoActivo = concursos.find((c) => c.slug === concursoActivoSlug) || {
    nome: concursoActivoSlug || "Concurso Geral",
    slug: concursoActivoSlug,
    vagaTitulo: "Vaga Geral",
    totalCandidatos: 0,
    estado: "aberto",
  };

  async function trocarConcurso(slug: string) {
    if (slug === concursoActivoSlug) return;

    startTransition(async () => {
      const res = await definirConcursoActivo(slug);
      if (res.ok) {
        toast.success(`Concurso alterado para "${slug}"`);
        router.refresh();
      } else {
        toast.error("Não foi possível alterar o concurso", { description: res.mensagem });
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={aMudar}
          className="flex h-9 items-center gap-2 border-white/20 bg-white/10 px-2.5 text-xs font-medium text-white hover:bg-white/20 hover:text-white"
        >
          {aMudar ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-consulvolt-amarelo" />
          ) : (
            <Layers className="h-3.5 w-3.5 text-consulvolt-amarelo" />
          )}
          <span className="max-w-[130px] truncate text-left sm:max-w-[190px]">
            {concursoActivo.nome}
          </span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Alternar Concurso</span>
          <span className="font-mono text-[10px] uppercase text-consulvolt-vermelho">Multi-Tenant</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="max-h-60 overflow-y-auto py-1">
          {concursos.map((c) => {
            const eActivo = c.slug === concursoActivoSlug;
            return (
              <DropdownMenuItem
                key={c.id || c.slug}
                onClick={() => trocarConcurso(c.slug)}
                className="flex cursor-pointer items-start justify-between gap-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className={`truncate text-xs font-semibold ${eActivo ? "text-consulvolt-vermelho" : ""}`}>
                      {c.nome}
                    </p>
                    {eActivo && <Check className="h-3 w-3 shrink-0 text-consulvolt-vermelho" />}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {c.vagaTitulo} • {c.totalCandidatos} candidaturas
                  </p>
                </div>
              </DropdownMenuItem>
            );
          })}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push("/admin/concursos")}
          className="cursor-pointer gap-2 text-xs font-medium text-slate-700"
        >
          <FolderKanban className="h-3.5 w-3.5 text-slate-500" />
          <span>Gerir Concursos</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
