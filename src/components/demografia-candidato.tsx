"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { corrigirDemografia } from "@/app/admin/accoes-demografia";
import { escalaoEtario, idadeEm, ROTULO_SEXO } from "@/lib/demografia/bi";

/**
 * ===========================================================================
 * SEXO E DATA DE NASCIMENTO NA FICHA
 * ---------------------------------------------------------------------------
 * Estes dois campos são lidos do BI por OCR, e o OCR erra. Se não houvesse
 * maneira de os corrigir, um erro de leitura ficaria para sempre, e a única
 * coisa que se notaria era um gráfico ligeiramente errado - que é a pior
 * espécie de erro, porque ninguém desconfia dele.
 *
 * Uma correcção feita aqui fica marcada como «manual» e a leitura automática
 * nunca mais lhe toca: quem corrigiu viu o documento, o OCR não viu melhor.
 * ===========================================================================
 */

export function DemografiaCandidato({
  candidatoId,
  sexo,
  nascimento,
  origem,
  podeEditar,
}: {
  candidatoId: string;
  sexo: string | null;
  nascimento: string | null;
  origem: string | null;
  podeEditar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [s, setS] = useState<string>(sexo ?? "");
  const [n, setN] = useState<string>(nascimento ?? "");
  const [recado, setRecado] = useState<string | null>(null);
  const [aGravar, gravar] = useTransition();

  const idade = idadeEm(nascimento);

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>
          {ROTULO_SEXO[sexo ?? ""] ?? "Não indicado"}
          {idade !== null && (
            <>
              {" · "}
              {idade} anos <span className="text-muted-foreground">({escalaoEtario(idade)})</span>
            </>
          )}
        </span>

        {origem && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
            {origem === "manual" ? "CORRIGIDO À MÃO" : "LIDO DO BI"}
          </span>
        )}

        {podeEditar && (
          <Button
            type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
            onClick={() => setAberto(true)}
          >
            <Pencil className="mr-1 h-3 w-3" aria-hidden />
            Corrigir
          </Button>
        )}

        {recado && <span className="text-xs text-emerald-700">{recado}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-medium text-slate-700">
        Sexo
        <select
          value={s}
          onChange={(e) => setS(e.target.value)}
          className="mt-1 block h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
        >
          <option value="">Não indicado</option>
          <option value="M">Masculino</option>
          <option value="F">Feminino</option>
        </select>
      </label>

      <label className="text-xs font-medium text-slate-700">
        Data de nascimento
        <input
          type="date"
          value={n}
          onChange={(e) => setN(e.target.value)}
          className="mt-1 block h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
        />
      </label>

      <Button
        type="button" size="sm" disabled={aGravar}
        onClick={() =>
          gravar(async () => {
            const r = await corrigirDemografia(
              candidatoId,
              s === "M" || s === "F" ? s : null,
              n || null
            );
            setRecado(r.mensagem);
            if (r.ok) setAberto(false);
          })
        }
      >
        {aGravar ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
        )}
        Guardar
      </Button>

      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(false)} disabled={aGravar}>
        <X className="mr-1 h-3.5 w-3.5" aria-hidden />
        Cancelar
      </Button>

      {recado && <p className="w-full text-xs text-rose-700">{recado}</p>}
    </div>
  );
}
