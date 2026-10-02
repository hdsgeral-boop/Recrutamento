import { AlertCircle, CheckCircle2 } from "lucide-react";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { CORES_EMAIL, ETIQUETAS_EMAIL } from "@/lib/constantes-email";
import type { EmailEnviado } from "@/types/database";

import { dataHora as quando } from "@/lib/datas";

/** Tudo o que já saiu para um candidato, do mais recente para o mais antigo. */
export async function HistoricoEmails({ candidatoId }: { candidatoId: string }) {
  const { data } = await criarClienteServidor()
    .from("emails_enviados")
    .select("*")
    .eq("candidato_id", candidatoId)
    .order("created_at", { ascending: false });

  const emails = (data ?? []) as EmailEnviado[];

  if (emails.length === 0) {
    return (
      <p className="rounded-lg border border-dashed bg-slate-50 p-4 text-sm text-muted-foreground">
        Ainda não saiu nenhum email para este candidato.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {emails.map((e) => (
        <li key={e.id} className="rounded-lg border bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CORES_EMAIL[e.tipo]}`}>
              {ETIQUETAS_EMAIL[e.tipo]}
            </span>
            {e.estado === "enviado" ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                enviado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
                <AlertCircle className="h-3 w-3" />
                falhou
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{quando(e.created_at)}</span>
          </div>

          <p className="mt-1.5 text-sm font-medium">{e.assunto}</p>
          <p className="text-xs text-muted-foreground">para {e.destinatario}</p>

          {e.resumo && <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{e.resumo}</p>}
          {e.erro && (
            <p className="mt-1.5 rounded bg-rose-50 p-2 font-mono text-[11px] text-rose-700">
              {e.erro}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
