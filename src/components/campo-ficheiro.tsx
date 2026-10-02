"use client";

import { useRef, useState } from "react";
import { FileCheck2, Loader2, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXTENSOES_ACEITES, TAMANHO_MAXIMO_KB } from "@/lib/constantes";
import { validarFicheiro } from "@/lib/validacoes";
import { comprimirImagem } from "@/lib/comprimir-imagem";

interface Props {
  id: string;
  etiqueta: string;
  descricao?: string;
  legenda?: string;
  ficheiro: File | null;
  aoMudar: (f: File | null) => void;
  erro?: string | null;
  desactivado?: boolean;
  obrigatorio?: boolean;
}

/** Caixa de upload de um documento, com validação e compressão de fotos. */
export function CampoFicheiro({
  id,
  etiqueta,
  descricao,
  legenda,
  ficheiro,
  aoMudar,
  erro,
  desactivado,
  obrigatorio = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [aProcessar, setAProcessar] = useState(false);
  const [foiComprimido, setFoiComprimido] = useState(false);

  const mensagem = erro ?? erroLocal;

  async function seleccionar(bruto: File | null) {
    if (!bruto) {
      setErroLocal(null);
      setFoiComprimido(false);
      aoMudar(null);
      return;
    }

    setAProcessar(true);
    setErroLocal(null);

    try {
      const original = bruto.size;
      // Fotos grandes são reduzidas aqui mesmo, antes de qualquer validação.
      const f = await comprimirImagem(bruto);
      setFoiComprimido(f.size < original);

      const problema = validarFicheiro(f, etiqueta);
      setErroLocal(problema);
      aoMudar(problema ? null : f);
    } catch {
      setErroLocal(`${etiqueta}: não consegui ler este ficheiro.`);
      aoMudar(null);
    } finally {
      setAProcessar(false);
    }
  }

  const tamanhoKb = ficheiro ? Math.round(ficheiro.size / 1024) : null;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta} {obrigatorio && <span className="text-consulvolt-vermelho">*</span>}
      </label>

      {legenda && <p className="text-xs text-muted-foreground">{legenda}</p>}

      <div
        onClick={() => !desactivado && !aProcessar && inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-3 transition-colors",
          ficheiro
            ? "border-emerald-400 bg-emerald-50"
            : "border-slate-300 bg-white hover:border-consulvolt-vermelho",
          mensagem && "border-rose-400 bg-rose-50",
          (desactivado || aProcessar) && "pointer-events-none opacity-60"
        )}
      >
        {aProcessar ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-slate-400" />
        ) : ficheiro ? (
          <FileCheck2 className="h-5 w-5 shrink-0 text-emerald-600" />
        ) : (
          <Paperclip className="h-5 w-5 shrink-0 text-slate-400" />
        )}

        <div className="min-w-0 flex-1">
          {aProcessar ? (
            <p className="text-sm text-slate-600">A preparar o ficheiro…</p>
          ) : ficheiro ? (
            <>
              <p className="truncate text-sm font-medium">{ficheiro.name}</p>
              <p className="text-xs text-muted-foreground">
                {tamanhoKb} KB{foiComprimido && " · imagem reduzida automaticamente"}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">Toca para anexar</p>
              <p className="text-xs text-muted-foreground">
                {descricao ?? `PDF, JPG ou PNG - até ${TAMANHO_MAXIMO_KB} KB`}
              </p>
            </>
          )}
        </div>

        {ficheiro && !desactivado && !aProcessar && (
          <button
            type="button"
            aria-label={`Remover ${etiqueta}`}
            onClick={(e) => {
              e.stopPropagation();
              if (inputRef.current) inputRef.current.value = "";
              seleccionar(null);
            }}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <input
        id={id}
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={EXTENSOES_ACEITES.join(",")}
        disabled={desactivado || aProcessar}
        onChange={(e) => seleccionar(e.target.files?.[0] ?? null)}
      />

      {mensagem && <p className="text-xs font-medium text-rose-600">{mensagem}</p>}
    </div>
  );
}
