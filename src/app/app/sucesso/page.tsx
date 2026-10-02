import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Mail, MessageCircle } from "lucide-react";
import { CabecalhoPublico } from "@/components/cabecalho-publico";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EMPRESA } from "@/lib/constantes";
import { lerDefinicoes } from "@/lib/definicoes";

export const metadata: Metadata = {
  title: "Candidatura recebida",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: { ref?: string; nome?: string };
}

/** Ecrã mostrado imediatamente após a submissão da candidatura. */
export default async function PaginaSucesso({ searchParams }: Props) {
  const { prazo } = await lerDefinicoes();
  const referencia = (searchParams.ref ?? "").replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase();
  const nome = (searchParams.nome ?? "").slice(0, 40);

  return (
    <>
      <CabecalhoPublico prazo={prazo} />

      <main className="container max-w-xl py-12">
        <Card>
          <CardContent className="space-y-5 p-7 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />

            <div>
              <h1 className="text-2xl font-bold">Candidatura recebida</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {nome ? `Obrigado, ${nome}. ` : "Obrigado. "}
                A tua candidatura à vaga de <strong>{EMPRESA.vaga}</strong> ficou registada no nosso
                sistema, com os documentos que anexaste.
              </p>
            </div>

            {referencia && (
              <div className="rounded-lg border border-dashed bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Referência da candidatura
                </p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-consulvolt-vermelho">
                  {referencia}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Guarda este código para qualquer contacto sobre o teu processo.
                </p>
              </div>
            )}

            <div className="space-y-3 text-left">
              <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-consulvolt-vermelho" />
                <p className="text-sm">
                  Enviámos-te um email de confirmação. Se não o vires na caixa de entrada, confere o
                  spam ou a pasta de promoções.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-consulvolt-vermelho" />
                <p className="text-sm">
                  Se o teu perfil corresponder ao que o projecto precisa, a equipa entra em contacto
                  pelo número que indicaste - por chamada ou WhatsApp.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <Button asChild variant="outline">
                <Link href={EMPRESA.site}>Conhecer a {EMPRESA.nome}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {EMPRESA.nomeCompleto}
        </p>
      </main>
    </>
  );
}
