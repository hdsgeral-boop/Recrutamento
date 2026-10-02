import Image from "next/image";
import type { Metadata } from "next";
import { FormularioLogin } from "@/components/formulario-login";
import { EMPRESA } from "@/lib/constantes";

export const metadata: Metadata = {
  title: "Entrar no painel",
  robots: { index: false, follow: false },
};

export default function PaginaLogin({ searchParams }: { searchParams: { voltar?: string } }) {
  const voltar = searchParams.voltar?.startsWith("/admin") ? searchParams.voltar : "/admin/dashboard";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-consulvolt-preto p-6">
      <div className="w-full max-w-sm">
        {/* Identidade: o logótipo é o primeiro elemento do ecrã, para quem
            entra saber logo em que sistema está a entrar. */}
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-28 w-28 items-center justify-center rounded-3xl bg-white p-3 shadow-2xl ring-1 ring-white/25">
            <Image
              src="/logo-consulvolt.png"
              alt="Logótipo da Consulvolt"
              width={112}
              height={112}
              priority
              className="h-full w-full object-contain"
            />
          </span>

          <div className="mt-5 text-3xl font-bold leading-none tracking-widest text-white">
            CONSUL<span className="text-consulvolt-amarelo">VOLT</span>
          </div>

          <span className="mt-3 h-0.5 w-14 rounded-full bg-consulvolt-vermelho" />

          <p className="mt-3 text-sm font-medium text-slate-300">{EMPRESA.vaga}</p>
          <p className="text-xs text-slate-500">{EMPRESA.projecto}</p>
        </div>

        <FormularioLogin voltar={voltar} />

        <p className="mt-6 text-center text-xs text-slate-500">
          Acesso reservado à equipa de recrutamento.
        </p>
      </div>
    </main>
  );
}
