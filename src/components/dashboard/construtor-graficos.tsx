"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { guardarGraficos } from "@/app/admin/accoes-funil";
import {
  AGREGACOES,
  CAMPOS,
  FEITIOS,
  GRAFICOS_PADRAO,
  type Agregacao,
  type Campo,
  type Feitio,
  type Grafico,
} from "@/lib/dashboard/campos";

/**
 * ===========================================================================
 * ACRESCENTAR GRÁFICOS
 * ---------------------------------------------------------------------------
 * Três escolhas e um título: por que campo se reparte, o que se conta, e como
 * se desenha. Foi isto que substituiu «diz-me que gráfico queres e eu faço-o»
 * - quem decide sobre contratações passa a poder fazer a pergunta seguinte
 * sozinho, sem esperar por ninguém.
 *
 * Não há pré-visualização aqui de propósito: a página inteira volta a nascer
 * no servidor quando se grava, com os dados verdadeiros. Uma pré-visualização
 * no cliente obrigaria a mandar todas as candidaturas para o browser - mais
 * lento, e dados pessoais a passear sem precisar.
 * ===========================================================================
 */

const NOVO: Omit<Grafico, "id"> = {
  titulo: "",
  campo: "municipio",
  agregacao: "contagem",
  feitio: "barrasH",
  topo: 8,
};

export function ConstrutorGraficos({
  iniciais,
  podeGuardar,
}: {
  iniciais: Grafico[];
  podeGuardar: boolean;
}) {
  const [graficos, setGraficos] = useState<Grafico[]>(iniciais);
  const [aAbrir, setAAbrir] = useState(false);
  const [rascunho, setRascunho] = useState<Omit<Grafico, "id">>(NOVO);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [aGravar, gravar] = useTransition();

  if (!podeGuardar) return null;

  const aplicar = (lista: Grafico[]) => {
    setGraficos(lista);
    setRecado(null);
    gravar(async () => {
      const r = await guardarGraficos(lista);
      setRecado({ ok: r.ok, texto: r.ok ? "Gravado. A página já está com a lista nova." : r.mensagem });
      if (!r.ok) setGraficos(graficos);
    });
  };

  const acrescentar = () => {
    const campo = CAMPOS.find((c) => c.chave === rascunho.campo);
    const agregacao = AGREGACOES.find((a) => a.chave === rascunho.agregacao);
    const titulo =
      rascunho.titulo.trim() || `${agregacao?.rotulo ?? "Quantos são"} por ${campo?.rotulo ?? "campo"}`;

    aplicar([...graficos, { ...rascunho, titulo, id: `g-${Date.now().toString(36)}` }]);
    setRascunho(NOVO);
    setAAbrir(false);
  };

  const trocar = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= graficos.length) return;
    const lista = [...graficos];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    aplicar(lista);
  };

  return (
    <section className="rounded-xl border border-dashed bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Os gráficos desta página</h2>
          <p className="text-xs text-muted-foreground">
            Escolhe o campo e a conta. O gráfico aparece para toda a gente que abrir o Dashboard.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {aGravar && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => aplicar(GRAFICOS_PADRAO)}
            disabled={aGravar}
            title="Volta aos seis gráficos com que a página nasceu"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Repor os de origem
          </Button>
          <Button type="button" size="sm" onClick={() => setAAbrir((v) => !v)} disabled={aGravar}>
            {aAbrir ? (
              <>
                <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Fechar
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Acrescentar gráfico
              </>
            )}
          </Button>
        </div>
      </div>

      {recado && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            recado.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
          }`}
          role="status"
        >
          {recado.ok ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          {recado.texto}
        </p>
      )}

      {/* ---------------------------------------------------- GRÁFICO NOVO */}
      {aAbrir && (
        <div className="mt-4 grid gap-3 rounded-lg border bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-medium text-slate-700">
            Repartir por
            <select
              value={rascunho.campo}
              onChange={(e) => setRascunho({ ...rascunho, campo: e.target.value as Campo })}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
            >
              {CAMPOS.map((c) => (
                <option key={c.chave} value={c.chave}>
                  {c.rotulo}
                  {c.nota ? ` (${c.nota})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-slate-700">
            Contar
            <select
              value={rascunho.agregacao}
              onChange={(e) => setRascunho({ ...rascunho, agregacao: e.target.value as Agregacao })}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
            >
              {AGREGACOES.map((a) => (
                <option key={a.chave} value={a.chave}>
                  {a.rotulo}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-slate-700">
            Desenhar como
            <select
              value={rascunho.feitio}
              onChange={(e) => setRascunho({ ...rascunho, feitio: e.target.value as Feitio })}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
            >
              {FEITIOS.map((f) => (
                <option key={f.chave} value={f.chave}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-slate-700">
            Título (deixa vazio para automático)
            <input
              value={rascunho.titulo}
              onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })}
              placeholder="Ex.: Candidaturas por bairro"
              className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
            />
          </label>

          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="button" size="sm" onClick={acrescentar} disabled={aGravar}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Acrescentar e gravar
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------- LISTA ORDENÁVEL */}
      {graficos.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {graficos.map((g, i) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{g.titulo}</span>
              <span className="text-xs text-muted-foreground">
                {CAMPOS.find((c) => c.chave === g.campo)?.rotulo} ·{" "}
                {FEITIOS.find((f) => f.chave === g.feitio)?.rotulo}
              </span>
              <span className="flex items-center gap-1">
                <Button
                  type="button" variant="outline" size="sm" className="h-8 w-8 p-0"
                  onClick={() => trocar(i, -1)} disabled={i === 0 || aGravar} aria-label="Subir"
                >
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button
                  type="button" variant="outline" size="sm" className="h-8 w-8 p-0"
                  onClick={() => trocar(i, 1)} disabled={i === graficos.length - 1 || aGravar} aria-label="Descer"
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button
                  type="button" variant="outline" size="sm"
                  className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                  onClick={() => aplicar(graficos.filter((x) => x.id !== g.id))}
                  disabled={aGravar} aria-label={`Apagar ${g.titulo}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
