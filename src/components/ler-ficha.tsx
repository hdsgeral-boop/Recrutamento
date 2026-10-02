"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { lerFichaFotografada } from "@/app/admin/accoes-leitura";
import { CONFIANCA_MINIMA, type Leitura } from "@/lib/entrevista/leitura-ficha";
import { ESCALA, type Marcacao } from "@/lib/entrevista/roteiro";

/**
 * ===========================================================================
 * CARREGAR A FOTOGRAFIA DA FICHA
 * ---------------------------------------------------------------------------
 * A foto vai para o servidor, volta uma lista de marcações, e essas marcações
 * entram no ecrã como PROPOSTA - as mesmas caixas de sempre, já carregadas.
 * Guardar continua a ser um acto de quem entrevista.
 *
 * As linhas em que o modelo hesitou ficam DE FORA da proposta e listadas à
 * parte. Pré-preencher uma marcação duvidosa era a pior maneira de a esconder:
 * quem revê olha para uma caixa já marcada e segue em frente.
 * ===========================================================================
 */

export function LerFicha({
  candidatoId,
  aplicar,
}: {
  candidatoId: string;
  /** Recebe as marcações em que se pode confiar. */
  aplicar: (respostas: Partial<Record<string, Marcacao>>) => void;
}) {
  const [aLer, setALer] = useState(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  async function escolher(ficheiro: File) {
    setALer(true);
    setLeitura(null);

    try {
      const base64 = await paraBase64(ficheiro);

      const r = await lerFichaFotografada({
        candidatoId,
        base64,
        tipo: ficheiro.type,
        bytes: ficheiro.size,
      });

      if (!r.ok) {
        toast.error(r.mensagem);
        if (r.leitura) setLeitura(r.leitura);
        return;
      }

      setLeitura(r.leitura ?? null);

      const quantas = Object.keys(r.leitura?.respostas ?? {}).length;
      if (quantas > 0) {
        aplicar(r.leitura!.respostas);
        toast.success(r.mensagem);
      } else {
        toast.warning("Li a folha, mas nenhuma linha teve confiança suficiente. Marca à mão.");
      }
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não consegui ler a fotografia.");
    } finally {
      setALer(false);
      if (campo.current) campo.current.value = "";
    }
  }

  return (
    <div className="border-b bg-slate-50 px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={campo}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) escolher(f);
          }}
        />

        <button
          type="button"
          disabled={aLer}
          onClick={() => campo.current?.click()}
          className="flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold transition-colors hover:border-slate-400 disabled:opacity-50"
        >
          {aLer ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {aLer ? "A ler a folha" : "Ler ficha de papel"}
        </button>

        <span className="text-[11px] text-muted-foreground">
          Fotografa a ficha preenchida. As marcações aparecem em baixo para confirmares -
          nada é guardado sozinho.
        </span>

        {leitura && (
          <button
            type="button"
            onClick={() => setLeitura(null)}
            className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            title="Fechar o resultado da leitura"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {leitura && <Resultado leitura={leitura} />}
    </div>
  );
}

function Resultado({ leitura }: { leitura: Leitura }) {
  const confianca = Math.round(leitura.confiancaGlobal * 100);
  const fiavel = leitura.confiancaGlobal >= CONFIANCA_MINIMA;

  return (
    <div className="mt-2.5 space-y-2 rounded-lg border bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {fiavel ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        ) : (
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        )}
        <span className="font-medium">
          {leitura.linhas.length} linha(s) lida(s), confiança {confianca}%
        </span>
        {!fiavel && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
            revê tudo
          </span>
        )}
      </div>

      {leitura.aviso && (
        <p className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">{leitura.aviso}</p>
      )}

      {leitura.duvidosas.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-amber-900">
            Estas ficaram por marcar, porque não as li com certeza:
          </p>
          <ul className="space-y-0.5">
            {leitura.duvidosas.map((l) => (
              <li key={l.codigo} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded border bg-slate-50 px-1 font-mono font-semibold">{l.codigo}</span>
                <span className="text-muted-foreground">
                  parecia <strong>{l.marcacao ? ESCALA[l.marcacao].rotulo : "em branco"}</strong>, com{" "}
                  {Math.round(l.confianca * 100)}% de certeza
                  {l.observado && ` (${l.observado})`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {leitura.emFalta.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Não encontrei na folha: {leitura.emFalta.join(", ")}.
        </p>
      )}

      {leitura.desconhecidos.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Ignorei códigos que não são deste roteiro: {leitura.desconhecidos.join(", ")}.
        </p>
      )}

      <p className={cn("text-[11px] leading-snug text-muted-foreground")}>
        A nota é sempre calculada aqui, a partir das marcações. O leitor nunca soma nada.
      </p>
    </div>
  );
}

/** Ficheiro para base64, sem o prefixo "data:...;base64,". */
function paraBase64(ficheiro: File): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const texto = String(leitor.result ?? "");
      const virgula = texto.indexOf(",");
      resolver(virgula >= 0 ? texto.slice(virgula + 1) : texto);
    };
    leitor.onerror = () => rejeitar(new Error("Não consegui ler o ficheiro."));
    leitor.readAsDataURL(ficheiro);
  });
}
