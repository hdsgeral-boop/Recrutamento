import Image from "next/image";
import { ContadorPrazo } from "@/components/contador-prazo";

interface CabecalhoPublicoProps {
  prazo: string;
  organizacaoNome?: string;
  logotipoUrl?: string | null;
  corFaixa?: string;
}

/** Faixa de topo: identidade institucional e prazo das candidaturas. */
export function CabecalhoPublico({
  prazo,
  organizacaoNome = "CONSULVOLT",
  logotipoUrl = "/logo-consulvolt.png",
  corFaixa = "bg-consulvolt-vermelho",
}: CabecalhoPublicoProps) {
  return (
    <header className="bg-consulvolt-preto text-white">
      <div className="container flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-4">
        {/* Identidade, à esquerda */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/95 p-1.5 shadow-sm ring-1 ring-white/20 sm:h-14 sm:w-14">
            <Image
              src={logotipoUrl || "/logo-consulvolt.png"}
              alt={`Logótipo da ${organizacaoNome}`}
              width={56}
              height={56}
              priority
              className="h-full w-full object-contain"
            />
          </div>

          <div className="min-w-0">
            <div className="text-lg font-bold leading-none tracking-widest sm:text-xl">
              {organizacaoNome === "CONSULVOLT" ? (
                <>
                  CONSUL<span className="text-consulvolt-amarelo">VOLT</span>
                </>
              ) : (
                <span>{organizacaoNome}</span>
              )}
            </div>
          </div>
        </div>

        {/* Prazo das candidaturas, à direita */}
        <ContadorPrazo prazo={prazo} />
      </div>
      <div className={`h-1 w-full ${corFaixa}`} />
    </header>
  );
}
