"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MUNICIPIOS_POR_PROVINCIA, PROVINCIAS, STATUS, type Provincia } from "@/lib/constantes";
import { haDias, hojeEmAngola } from "@/lib/datas";

const TODOS = "__todos__";

/** Como cada filtro se chama quando aparece numa etiqueta. */
const NOMES: Record<string, string> = {
  q: "Procura",
  provincia: "Província",
  municipio: "Município",
  status: "Estado",
  carta: "Carta",
  mtbt: "MT/BT",
  experiencia: "Experiência",
  de: "Desde",
  ate: "Até",
};

const SIM_NAO = (v: string) => (v === "sim" ? "Sim" : v === "nao" ? "Não" : v);

/**
 * Atalhos de datas. Contam sempre a partir de hoje em Angola, para "últimos
 * 7 dias" querer dizer a mesma coisa quer se abra o painel de manhã em Caxito
 * quer se abra à noite de outro fuso.
 */
const ATALHOS_DATA: { etiqueta: string; de: () => string; ate: () => string }[] = [
  { etiqueta: "Hoje", de: () => hojeEmAngola(), ate: () => hojeEmAngola() },
  { etiqueta: "Ontem", de: () => haDias(1), ate: () => haDias(1) },
  { etiqueta: "Últimos 7 dias", de: () => haDias(6), ate: () => hojeEmAngola() },
  { etiqueta: "Últimos 30 dias", de: () => haDias(29), ate: () => hojeEmAngola() },
];

/** Atalhos para as perguntas que o RH faz todos os dias. */
const ATALHOS: { etiqueta: string; filtros: Record<string, string> }[] = [
  { etiqueta: "Por avaliar", filtros: { status: "Pendente" } },
  { etiqueta: "Perfil completo", filtros: { mtbt: "sim", carta: "sim", experiencia: "sim" } },
  { etiqueta: "Com experiência", filtros: { experiencia: "sim" } },
  { etiqueta: "Conhece MT/BT", filtros: { mtbt: "sim" } },
  { etiqueta: "Aprovados", filtros: { status: "Aprovado" } },
];

export function FiltrosCandidatos({ estados }: { estados?: readonly string[] } = {}) {
  // O filtro oferece os estados configurados, mais os nomes antigos: quem
  // procura por "Pendente" depois de o nome ter mudado tem de encontrar as
  // candidaturas antigas.
  const opcoesEstado = estados && estados.length > 0 ? estados : STATUS;
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();
  const [aCarregar, iniciar] = useTransition();
  // Se já há um intervalo de datas no endereço, o painel abre: senão a pessoa
  // vê a lista filtrada sem perceber porquê nem onde desfazer.
  const [aberto, setAberto] = useState(
    () => Boolean(parametros.get("de") || parametros.get("ate"))
  );

  const valor = (chave: string) => parametros.get(chave) ?? TODOS;
  const provinciaEscolhida = parametros.get("provincia") as Provincia | null;

  /** Lista dos filtros activos, para as etiquetas removíveis. */
  const activos = useMemo(() => {
    const lista: { chave: string; texto: string }[] = [];
    parametros.forEach((v, k) => {
      if (!NOMES[k] || !v) return;
      const legivel = k === "carta" || k === "mtbt" || k === "experiencia" ? SIM_NAO(v) : v;
      lista.push({ chave: k, texto: `${NOMES[k]}: ${legivel}` });
    });
    return lista;
  }, [parametros]);

  const aplicar = useCallback(
    (mudancas: Record<string, string | null>, limpar?: string[]) => {
      const p = new URLSearchParams(parametros.toString());
      Object.entries(mudancas).forEach(([k, v]) => {
        if (!v || v === TODOS) p.delete(k);
        else p.set(k, v);
      });
      limpar?.forEach((k) => p.delete(k));
      // Mudar de filtro volta sempre à primeira página: estar na página 7 de
      // um filtro antigo não quer dizer nada no filtro novo.
      p.delete("pagina");
      iniciar(() => router.push(p.toString() ? `${caminho}?${p}` : caminho));
    },
    [parametros, caminho, router]
  );

  const municipios = provinciaEscolhida
    ? MUNICIPIOS_POR_PROVINCIA[provinciaEscolhida] ?? []
    : Object.values(MUNICIPIOS_POR_PROVINCIA).flat();

  const atalhoActivo = (filtros: Record<string, string>) =>
    Object.entries(filtros).every(([k, v]) => parametros.get(k) === v);

  const Escolha = ({
    chave,
    etiqueta,
    opcoes,
    limpar,
  }: {
    chave: string;
    etiqueta: string;
    opcoes: readonly string[];
    limpar?: string[];
  }) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{etiqueta}</Label>
      <Select value={valor(chave)} onValueChange={(v) => aplicar({ [chave]: v }, limpar)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos</SelectItem>
          {opcoes.map((o) => (
            <SelectItem key={o} value={o}>
              {SIM_NAO(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="no-print space-y-3 rounded-xl border bg-white p-4">
      {/* Procura + botão de filtros avançados */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Procurar por nome, BI, telefone ou email"
            defaultValue={parametros.get("q") ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") aplicar({ q: (e.target as HTMLInputElement).value.trim() });
            }}
            onBlur={(e) => aplicar({ q: e.target.value.trim() })}
          />
        </div>

        <Button
          variant={aberto ? "secondary" : "outline"}
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {activos.length > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {activos.length}
            </span>
          )}
        </Button>

        {aCarregar && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Atalhos rápidos */}
      <div className="flex flex-wrap gap-1.5">
        {ATALHOS.map((a) => {
          const activo = atalhoActivo(a.filtros);
          return (
            <button
              key={a.etiqueta}
              type="button"
              onClick={() =>
                aplicar(
                  activo
                    ? Object.fromEntries(Object.keys(a.filtros).map((k) => [k, null]))
                    : a.filtros
                )
              }
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activo
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-slate-300 bg-white text-slate-600 hover:border-primary hover:text-primary"
              )}
            >
              {a.etiqueta}
            </button>
          );
        })}
      </div>

      {/* Filtros detalhados */}
      {aberto && (
        <div className="space-y-3 border-t pt-3">
          {/* ------------------------------------------------ DATAS ------ */}
          <div className="rounded-lg border bg-slate-50 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" />
              Data de submissão
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="filtro-de" className="text-xs text-muted-foreground">
                  Desde
                </Label>
                <Input
                  id="filtro-de"
                  type="date"
                  className="h-9 w-[160px] bg-white"
                  value={parametros.get("de") ?? ""}
                  max={parametros.get("ate") ?? undefined}
                  onChange={(e) => aplicar({ de: e.target.value || null })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filtro-ate" className="text-xs text-muted-foreground">
                  Até
                </Label>
                <Input
                  id="filtro-ate"
                  type="date"
                  className="h-9 w-[160px] bg-white"
                  value={parametros.get("ate") ?? ""}
                  min={parametros.get("de") ?? undefined}
                  onChange={(e) => aplicar({ ate: e.target.value || null })}
                />
              </div>

              {(parametros.get("de") || parametros.get("ate")) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => aplicar({ de: null, ate: null })}
                >
                  <X className="h-3.5 w-3.5" />
                  Limpar datas
                </Button>
              )}
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {ATALHOS_DATA.map((a) => {
                const de = a.de();
                const ate = a.ate();
                const activo = parametros.get("de") === de && parametros.get("ate") === ate;

                return (
                  <button
                    key={a.etiqueta}
                    type="button"
                    onClick={() => aplicar(activo ? { de: null, ate: null } : { de, ate })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      activo
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-slate-300 bg-white text-slate-600 hover:border-primary hover:text-primary"
                    )}
                  >
                    {a.etiqueta}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ------------------------------------------- OS OUTROS ------ */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Escolha
              chave="provincia"
              etiqueta="Província"
              opcoes={PROVINCIAS}
              limpar={["municipio"]}
            />
            <Escolha chave="municipio" etiqueta="Município" opcoes={municipios} />
            <Escolha chave="status" etiqueta="Estado" opcoes={opcoesEstado} />
            <Escolha chave="carta" etiqueta="Carta de condução" opcoes={["sim", "nao"]} />
            <Escolha chave="mtbt" etiqueta="Conhece MT/BT" opcoes={["sim", "nao"]} />
            <Escolha
              chave="experiencia"
              etiqueta="Experiência similar"
              opcoes={["sim", "nao"]}
            />
          </div>
        </div>
      )}

      {/* Etiquetas dos filtros activos, cada uma removível */}
      {activos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
          {activos.map((f) => (
            <span
              key={f.chave}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs font-medium"
            >
              {f.texto}
              <button
                type="button"
                aria-label={`Remover filtro ${f.texto}`}
                onClick={() =>
                  aplicar({ [f.chave]: null }, f.chave === "provincia" ? ["municipio"] : undefined)
                }
                className="rounded-full p-0.5 hover:bg-slate-300"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => iniciar(() => router.push(caminho))}
          >
            Limpar tudo
          </Button>
        </div>
      )}
    </div>
  );
}
