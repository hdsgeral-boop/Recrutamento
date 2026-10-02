import { AlertCircle } from "lucide-react";

import { GestaoUtilizadores, type ContaNaLista } from "@/components/gestao-utilizadores";
import { PopUpPermissoes } from "@/components/pop-up-permissoes";
import { listarUtilizadores, sessaoActual } from "@/lib/utilizadores";

export const dynamic = "force-dynamic";

/**
 * Gestão das contas de acesso ao painel.
 *
 * O quadro das permissões saiu daqui para um pop-up: é uma consulta que se
 * faz uma vez, quando se decide o papel de alguém, e estava a empurrar a
 * lista de contas para baixo da dobra em todos os acessos seguintes.
 */
export default async function Utilizadores() {
  const [sessao, { lista, erro }] = await Promise.all([sessaoActual(), listarUtilizadores()]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Utilizadores</h1>
          <p className="text-sm text-muted-foreground">
            Quem entra no painel e o que cada um pode fazer.
          </p>
        </div>

        <PopUpPermissoes />
      </div>

      {erro && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="font-semibold text-amber-900">Falta correr uma migração no Supabase</p>
            <p className="mt-1 text-sm text-amber-800">
              Corre, por esta ordem,{" "}
              <code className="break-all rounded bg-amber-100 px-1">
                supabase/migrations/20260906_utilizadores_e_fases.sql
              </code>{" "}
              e{" "}
              <code className="break-all rounded bg-amber-100 px-1">
                supabase/migrations/20260906b_perfil_utilizadores.sql
              </code>{" "}
              no SQL Editor e recarrega. Nada do que já existe é apagado.
            </p>
            <p className="mt-2 break-all font-mono text-xs text-amber-700">{erro}</p>
          </div>
        </div>
      )}

      {!erro && (
        <GestaoUtilizadores
          contas={lista as unknown as ContaNaLista[]}
          euSou={sessao?.utilizador ?? ""}
        />
      )}
    </div>
  );
}
