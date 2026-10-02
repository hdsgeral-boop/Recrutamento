import Image from "next/image";
import type { Metadata } from "next";
import { KeyRound } from "lucide-react";

import { TrocarPalavraPasse } from "@/components/trocar-palavra-passe";
import { sair } from "@/app/admin/accoes-login";
import { sessaoActual } from "@/lib/utilizadores";
import { EMPRESA } from "@/lib/constantes";

export const metadata: Metadata = {
  title: "Trocar a palavra-passe",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Ecrã de passagem obrigatória.
 *
 * Fica fora do layout do painel de propósito: enquanto a palavra-passe for a
 * que o sistema gerou, não há painel nenhum para mostrar. Só se pode trocar
 * a palavra-passe ou sair.
 */
export default async function PaginaTrocar() {
  const sessao = await sessaoActual();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-consulvolt-preto p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2.5 shadow-2xl ring-1 ring-white/25">
            <Image
              src="/logo-consulvolt.png"
              alt="Logótipo da Consulvolt"
              width={80}
              height={80}
              priority
              className="h-full w-full object-contain"
            />
          </span>
          <div className="mt-4 text-2xl font-bold tracking-widest text-white">
            CONSUL<span className="text-consulvolt-amarelo">VOLT</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{EMPRESA.projecto}</p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                Escolhe a tua palavra-passe antes de continuar
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                A que recebeste por email foi gerada pelo sistema e serve só para esta primeira
                entrada. Escolhe agora uma que só tu saibas - nem quem criou a conta a conhece.
              </p>
            </div>
          </div>

          {sessao && (
            <p className="mb-4 text-sm text-muted-foreground">
              Sessão de <strong className="text-foreground">{sessao.nome}</strong> (
              <span className="font-mono text-xs">{sessao.utilizador}</span>)
            </p>
          )}

          <TrocarPalavraPasse obrigatorio />
        </div>

        <form action={sair} className="mt-4 text-center">
          <button type="submit" className="text-xs text-slate-500 underline hover:text-slate-300">
            Não sou eu, sair da sessão
          </button>
        </form>
      </div>
    </main>
  );
}
