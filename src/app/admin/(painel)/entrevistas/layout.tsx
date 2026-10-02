import { ClipboardList } from "lucide-react";

import { SeparadoresEntrevistas } from "@/components/separadores-entrevistas";
import { sessaoActual } from "@/lib/utilizadores";
import { pode } from "@/lib/permissoes";

export const dynamic = "force-dynamic";

/**
 * Cabeçalho e separadores comuns a toda a área de Entrevistas.
 *
 * Os separadores repetem o que o submenu da barra já mostra, e isso é de
 * propósito: no telemóvel o submenu está escondido dentro do hambúrguer, e
 * quem está a trabalhar precisa de saltar entre listas sem voltar ao menu.
 */
export default async function LayoutEntrevistas({ children }: { children: React.ReactNode }) {
  const sessao = await sessaoActual();
  const gere = pode(sessao?.papel, "gerir_entrevistas");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ClipboardList className="h-5 w-5 shrink-0 text-consulvolt-vermelho" />
            Entrevistas
          </h1>
          <p className="text-sm text-muted-foreground">
            Quem entrevista quem, em que ponto está cada processo, e como correu.
          </p>
        </div>

        {sessao?.eRecrutador && !gere && (
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 ring-1 ring-violet-300">
            És recrutador: vês todos, entrevistas os teus
          </span>
        )}
      </div>

      <SeparadoresEntrevistas gere={gere} />

      {children}
    </div>
  );
}
