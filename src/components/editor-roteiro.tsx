"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ClipboardList,
  GripVertical,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { guardarRoteiro } from "@/app/admin/accoes-roteiro";
import {
  NOME_BLOCO,
  PESO_TOTAL_EXIGIDO,
  validarRoteiro,
  type Bloco,
  type Pergunta,
} from "@/lib/entrevista/roteiro";
import { GRUPOS_PERGUNTA, NOME_GRUPO, type GrupoPergunta } from "@/lib/entrevista/experiencia";

/**
 * ===========================================================================
 * EDITOR DO ROTEIRO
 * ---------------------------------------------------------------------------
 * As perguntas, os pesos e o que o entrevistador deve procurar, tudo editável
 * aqui, sem deploy.
 *
 * O PESO ESTÁ SEMPRE À VISTA, e a soma também. A regra é somarem 100: é isso
 * que faz a nota de uma pessoa ser comparável com a de outra. Por isso a soma
 * aparece a verde ou a vermelho a cada tecla, e o botão de gravar fica
 * travado enquanto a conta não bater certo - em vez de aceitar e só depois
 * dizer que não.
 *
 * Gravar cria uma VERSÃO NOVA. As entrevistas já feitas continuam agarradas à
 * versão com que foram feitas, e não mudam de significado por baixo.
 * ===========================================================================
 */

/** Sugere um código livre para uma pergunta nova do grupo pedido. */
function codigoLivre(perguntas: Pergunta[], grupo: GrupoPergunta): string {
  const prefixo = grupo === "com_experiencia" ? "E" : grupo === "sem_experiencia" ? "N" : "G";
  const usados = new Set(perguntas.map((p) => p.codigo.toUpperCase()));
  for (let i = 1; i < 100; i++) {
    if (!usados.has(`${prefixo}${i}`)) return `${prefixo}${i}`;
  }
  return `${prefixo}${perguntas.length + 1}`;
}

/**
 * Reparte `alvo` pontos por um conjunto, respeitando as proporções actuais.
 *
 * O arredondamento tira ou põe pontos; o resto vai para quem tem maior parte
 * decimal, que é o critério que menos distorce os pesos relativos. Mínimo de
 * 1 ponto por pergunta: uma pergunta a valer zero não é uma pergunta.
 */
function repartir(pesos: number[], alvo: number): number[] {
  if (pesos.length === 0) return [];

  const total = pesos.reduce((s, v) => s + v, 0);
  const fraccoes = total > 0 ? pesos.map((v) => v / total) : pesos.map(() => 1 / pesos.length);
  const brutos = fraccoes.map((f) => f * alvo);
  const inteiros = brutos.map((v) => Math.max(1, Math.floor(v)));

  let resto = alvo - inteiros.reduce((s, v) => s + v, 0);
  const ordem = brutos
    .map((v, i) => ({ i, dec: v - Math.floor(v) }))
    .sort((a, b) => b.dec - a.dec);

  let k = 0;
  const limite = pesos.length * 200;
  while (resto > 0 && k < limite) {
    inteiros[ordem[k % ordem.length].i]++;
    resto--;
    k++;
  }
  while (resto < 0 && k < limite) {
    const alvoI = ordem[k % ordem.length].i;
    if (inteiros[alvoI] > 1) {
      inteiros[alvoI]--;
      resto++;
    }
    k++;
  }

  return inteiros;
}

export function EditorRoteiro({
  versao,
  iniciais,
  daBaseDeDados,
  porMigrar,
  avisos,
  criadoEm,
  criadoPor,
}: {
  versao: string;
  iniciais: Pergunta[];
  daBaseDeDados: boolean;
  porMigrar: boolean;
  avisos: string[];
  criadoEm: string | null;
  criadoPor: string | null;
}) {
  const router = useRouter();

  const [perguntas, setPerguntas] = useState<Pergunta[]>(iniciais);
  const [notas, setNotas] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  /**
   * O que o SERVIDOR recusou, palavra por palavra.
   *
   * Antes isto ia para a consola do browser, onde ninguém olha. Quem estava a
   * editar via só "o roteiro não pode ser gravado assim" e ficava sem saber o
   * que corrigir. Uma recusa sem motivo à vista é uma recusa inútil.
   */
  const [recusa, setRecusa] = useState<string[]>([]);

  /**
   * A soma de cada PERCURSO, e não da lista.
   *
   * Ninguém responde a todas as perguntas: quem tem experiência responde às
   * comuns mais as do seu grupo. É cada percurso que tem de dar 100, senão as
   * duas notas deixam de ser comparáveis.
   */
  const somas = useMemo(() => {
    const doPercurso = (g: "com_experiencia" | "sem_experiencia") =>
      perguntas
        .filter((p) => (p.grupo ?? "ambos") === "ambos" || p.grupo === g)
        .reduce((s, p) => s + (Number(p.peso) || 0), 0);

    return {
      com: Math.round(doPercurso("com_experiencia") * 100) / 100,
      sem: Math.round(doPercurso("sem_experiencia") * 100) / 100,
    };
  }, [perguntas]);
  const erros = useMemo(() => validarRoteiro(perguntas), [perguntas]);

  const mudou = useMemo(
    () => JSON.stringify(perguntas) !== JSON.stringify(iniciais),
    [perguntas, iniciais]
  );

  const mexer = (i: number, campo: keyof Pergunta, valor: string | number) => {
    // Assim que se corrige alguma coisa, a recusa anterior deixa de valer.
    setRecusa([]);
    setPerguntas((antes) =>
      antes.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p))
    );
  };

  const acrescentar = (grupo: GrupoPergunta) =>
    setPerguntas((antes) => {
      const nova: Pergunta = {
        codigo: codigoLivre(antes, grupo),
        bloco: "tecnica",
        pergunta: "",
        procurar: "",
        peso: 0,
        grupo,
      };
      // Entra no fim do seu grupo, e não no fim de tudo, para a ordem da
      // entrevista continuar a fazer sentido.
      const ultimo = antes.map((p) => p.grupo ?? "ambos").lastIndexOf(grupo);
      const copia = [...antes];
      copia.splice(ultimo === -1 ? antes.length : ultimo + 1, 0, nova);
      setAberta(nova.codigo);
      return copia;
    });

  const apagar = (i: number) => {
    const p = perguntas[i];
    if (!window.confirm(`Tirar a pergunta ${p.codigo} do roteiro? Os ${p.peso} pontos dela ficam por distribuir.`)) return;
    setPerguntas((antes) => antes.filter((_, idx) => idx !== i));
  };

  const mover = (i: number, direccao: -1 | 1) =>
    setPerguntas((antes) => {
      const j = i + direccao;
      if (j < 0 || j >= antes.length) return antes;
      const copia = [...antes];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });

  /**
   * Reparte o que falta (ou o que sobra) pelas perguntas, proporcionalmente
   * ao peso que já têm. Serve para quem acrescentou uma pergunta e não quer
   * fazer a conta à mão.
   */
  /**
   * Reparte os pesos para os DOIS percursos darem 100.
   *
   * As perguntas comuns mudam os dois percursos ao mesmo tempo, por isso não
   * se pode tratar cada um por si. A conta faz-se em dois passos: primeiro
   * fixa-se o peso das comuns no percurso mais pesado, depois acerta-se cada
   * grupo com o que falta.
   */
  function equilibrar() {
    if (perguntas.length === 0) return;

    const comuns = perguntas.filter((p) => (p.grupo ?? "ambos") === "ambos");
    const temGrupos = perguntas.some((p) => p.grupo === "com_experiencia" || p.grupo === "sem_experiencia");

    if (temGrupos && comuns.length > 0) {
      const pesoComuns = repartir(comuns.map((p) => Number(p.peso) || 0), Math.min(80, PESO_TOTAL_EXIGIDO - 10));
      const sobra = PESO_TOTAL_EXIGIDO - pesoComuns.reduce((s, v) => s + v, 0);

      const novos = new Map<number, number>();
      comuns.forEach((p, i) => novos.set(perguntas.indexOf(p), pesoComuns[i]));

      for (const g of ["com_experiencia", "sem_experiencia"] as const) {
        const doGrupo = perguntas.filter((p) => p.grupo === g);
        if (doGrupo.length === 0) continue;
        const pesos = repartir(doGrupo.map((p) => Number(p.peso) || 0), sobra);
        doGrupo.forEach((p, i) => novos.set(perguntas.indexOf(p), pesos[i]));
      }

      setPerguntas((antes) => antes.map((p, i) => ({ ...p, peso: novos.get(i) ?? p.peso })));
      toast.success(`Pesos repartidos: cada percurso passa a somar ${PESO_TOTAL_EXIGIDO}.`);
      return;
    }

    const inteiros = repartir(
      perguntas.map((p) => Number(p.peso) || 0),
      PESO_TOTAL_EXIGIDO
    );

    setPerguntas((antes) => antes.map((p, i) => ({ ...p, peso: inteiros[i] })));
    toast.success(`Pesos repartidos para somar ${PESO_TOTAL_EXIGIDO}.`);
  }

  async function gravar() {
    if (erros.length > 0) return toast.error(erros[0]);

    if (
      !window.confirm(
        `Gravar cria uma versão nova do roteiro. As entrevistas já feitas continuam com a versão ${versao} e não mudam. Continuar?`
      )
    )
      return;

    setAGravar(true);
    setRecusa([]);
    try {
      const r = await guardarRoteiro(perguntas, notas);
      if (r.ok) {
        toast.success(r.mensagem);
        setNotas("");
        setRecusa([]);
        router.refresh();
      } else {
        toast.error(r.mensagem);
        setRecusa(r.erros?.length ? r.erros : [r.mensagem]);
      }
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : "Não foi possível gravar.";
      toast.error(msg);
      setRecusa([msg]);
    } finally {
      setAGravar(false);
    }
  }

  const somaOk = somas.com === PESO_TOTAL_EXIGIDO && somas.sem === PESO_TOTAL_EXIGIDO;

  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-3 py-3 sm:px-4">
        <ClipboardList className="h-4 w-4 shrink-0 text-consulvolt-vermelho" />
        <h2 className="text-sm font-semibold">Roteiro da entrevista</h2>
        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
          {versao}
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <span
            title="Percurso de quem tem experiência de cadastro"
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              somas.com === PESO_TOTAL_EXIGIDO
                ? "bg-emerald-100 text-emerald-800"
                : "bg-rose-100 text-rose-800"
            )}
          >
            com exp. {somas.com}/{PESO_TOTAL_EXIGIDO}
          </span>
          <span
            title="Percurso de quem não tem experiência de cadastro"
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              somas.sem === PESO_TOTAL_EXIGIDO
                ? "bg-emerald-100 text-emerald-800"
                : "bg-rose-100 text-rose-800"
            )}
          >
            sem exp. {somas.sem}/{PESO_TOTAL_EXIGIDO}
          </span>
        </span>
      </header>

      <div className="space-y-3 p-3 sm:p-4">
        {porMigrar && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Estas são as perguntas que estão no código. Para as poderes mudar aqui, corre
              primeiro o ficheiro{" "}
              <code className="break-all rounded bg-amber-100 px-1">
                supabase/CORRER-NO-SUPABASE.sql
              </code>{" "}
              no SQL Editor do Supabase. Nada do que já existe é apagado.
            </span>
          </p>
        )}

        {avisos.length > 0 && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <p className="font-semibold">
              O roteiro gravado não passou na validação, por isso está a valer o do código:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        {!porMigrar && !daBaseDeDados && avisos.length === 0 && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-muted-foreground">
            Ainda ninguém gravou alterações. Estas são as perguntas de origem - muda o que
            quiseres e grava para criar a primeira versão tua.
          </p>
        )}

        {daBaseDeDados && criadoEm && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-muted-foreground">
            Versão em vigor gravada por <strong>{criadoPor ?? "alguém"}</strong> em{" "}
            {new Date(criadoEm).toLocaleDateString("pt-PT", { timeZone: "Africa/Luanda" })}.
          </p>
        )}

        {/* ------------------------------------------------ AS PERGUNTAS -- */}
        {/* Agrupadas por QUEM RESPONDE, e não por bloco: é essa a decisão que
            a equipa toma aqui. O bloco continua a existir, e edita-se dentro
            de cada pergunta. */}
        <Coluna
          titulo="Perguntas comuns"
          subtitulo="Feitas a toda a gente. São estas que tornam as duas notas comparáveis."
          grupo="ambos"
          perguntas={perguntas}
          mexer={mexer}
          apagar={apagar}
          mover={mover}
          acrescentar={() => acrescentar("ambos")}
          aberta={aberta}
          setAberta={setAberta}
        />

        <div className="grid gap-3 lg:grid-cols-2">
          <Coluna
            titulo="Só para quem já fez"
            subtitulo="Pedem método já formado e detalhe de quem esteve no terreno."
            grupo="com_experiencia"
            cor="sky"
            perguntas={perguntas}
            mexer={mexer}
            apagar={apagar}
            mover={mover}
            acrescentar={() => acrescentar("com_experiencia")}
            aberta={aberta}
            setAberta={setAberta}
            total={somas.com}
          />

          <Coluna
            titulo="Só para quem nunca fez"
            subtitulo="Procuram o mesmo por outra via. Não são mais fáceis: são sobre outra coisa."
            grupo="sem_experiencia"
            cor="amber"
            perguntas={perguntas}
            mexer={mexer}
            apagar={apagar}
            mover={mover}
            acrescentar={() => acrescentar("sem_experiencia")}
            aberta={aberta}
            setAberta={setAberta}
            total={somas.sem}
          />
        </div>

        {/* ------------------------------------------------ VALIDAÇÃO ----- */}
        {recusa.length > 0 && (
          <ul className="space-y-0.5 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800 ring-1 ring-rose-200">
            <li className="mb-1 font-semibold">O servidor não aceitou a gravação:</li>
            {recusa.map((e) => (
              <li key={e} className="flex items-start gap-1.5">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                {e}
              </li>
            ))}
          </ul>
        )}

        {erros.length > 0 && (
          <ul className="space-y-0.5 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800">
            {erros.map((e) => (
              <li key={e} className="flex items-start gap-1.5">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                {e}
              </li>
            ))}
          </ul>
        )}

        {/* ------------------------------------------------ GRAVAR -------- */}
        <div className="space-y-2 rounded-lg border bg-slate-50 p-3">
          <div className="space-y-1">
            <Label htmlFor="rot-notas" className="text-xs">
              O que muda nesta versão (fica no histórico)
            </Label>
            <Input
              id="rot-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ex.: subi o peso da pergunta do portão fechado"
              className="h-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={gravar} disabled={aGravar || erros.length > 0 || !mudou}>
              {aGravar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-2">
                {!mudou ? "Nada mudou" : aGravar ? "A gravar" : "Gravar versão nova"}
              </span>
            </Button>

            {!somaOk && (
              <Button variant="outline" onClick={equilibrar}>
                Repartir para dar {PESO_TOTAL_EXIGIDO}
              </Button>
            )}

            {mudou && (
              <Button variant="ghost" onClick={() => setPerguntas(iniciais)}>
                <RotateCcw className="h-4 w-4" />
                <span className="ml-2">Desfazer</span>
              </Button>
            )}
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Cada percurso - com experiência e sem experiência - tem de somar{" "}
            {PESO_TOTAL_EXIGIDO} pontos. As perguntas marcadas como "Todos" contam para os dois.
            Gravar não mexe nas entrevistas já feitas: elas ficam agarradas à versão com que foram
            feitas.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// UMA COLUNA DE PERGUNTAS
// ---------------------------------------------------------------------------

const CORES = {
  slate: { fundo: "bg-slate-50", risca: "border-slate-200", texto: "text-slate-600" },
  sky: { fundo: "bg-sky-50", risca: "border-sky-200", texto: "text-sky-800" },
  amber: { fundo: "bg-amber-50", risca: "border-amber-200", texto: "text-amber-800" },
} as const;

function Coluna({
  titulo,
  subtitulo,
  grupo,
  cor = "slate",
  perguntas,
  mexer,
  apagar,
  mover,
  acrescentar,
  aberta,
  setAberta,
  total,
}: {
  titulo: string;
  subtitulo: string;
  grupo: GrupoPergunta;
  cor?: keyof typeof CORES;
  perguntas: Pergunta[];
  mexer: (i: number, campo: keyof Pergunta, valor: string | number) => void;
  apagar: (i: number) => void;
  mover: (i: number, direccao: -1 | 1) => void;
  acrescentar: () => void;
  aberta: string | null;
  setAberta: (v: string | null) => void;
  /** Soma do percurso a que esta coluna pertence, quando faz sentido mostrá-la. */
  total?: number;
}) {
  const c = CORES[cor];

  // Guardamos o índice na lista completa: é por ele que se edita e se move.
  const minhas = perguntas
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (p.grupo ?? "ambos") === grupo);

  const pontos = minhas.reduce((s, { p }) => s + (Number(p.peso) || 0), 0);

  return (
    <div className={cn("rounded-xl border", c.risca)}>
      <div className={cn("flex flex-wrap items-center gap-2 rounded-t-xl border-b px-3 py-2.5", c.fundo, c.risca)}>
        <div className="min-w-0 flex-1">
          <h3 className={cn("text-xs font-semibold uppercase tracking-wide", c.texto)}>{titulo}</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{subtitulo}</p>
        </div>

        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
          {pontos} pts
          {total !== undefined && (
            <span className="ml-1 font-normal text-muted-foreground">
              (percurso: {total}/{PESO_TOTAL_EXIGIDO})
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={acrescentar}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-consulvolt-vermelho hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Acrescentar
        </button>
      </div>

      <ul className="divide-y">
        {minhas.length === 0 && (
          <li className="px-3 py-7 text-center text-xs text-muted-foreground">
            Sem perguntas próprias. Quem estiver neste grupo responde só às comuns.
          </li>
        )}

        {minhas.map(({ p, i }, posicao) => {
          const expandida = aberta === p.codigo;
          return (
            <li key={`${p.codigo}-${i}`} className="p-2.5">
              <div className="flex flex-wrap items-start gap-2">
                <button
                  type="button"
                  onClick={() => mover(i, -1)}
                  disabled={posicao === 0}
                  title="Subir"
                  className="mt-1.5 shrink-0 text-slate-300 hover:text-slate-600 disabled:opacity-30"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>

                <Input
                  value={p.codigo}
                  onChange={(e) => mexer(i, "codigo", e.target.value.toUpperCase())}
                  className="h-9 w-[58px] shrink-0 text-center font-mono text-xs font-semibold"
                  maxLength={5}
                  aria-label="Código da pergunta"
                />

                <button
                  type="button"
                  onClick={() => setAberta(expandida ? null : p.codigo)}
                  className="min-w-0 flex-1 basis-[160px] rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  {p.pergunta.trim() || (
                    <span className="text-muted-foreground">Pergunta sem texto</span>
                  )}
                </button>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={p.peso}
                    onChange={(e) => mexer(i, "peso", Number(e.target.value))}
                    className="h-9 w-[64px] text-center"
                    aria-label={`Peso de ${p.codigo}`}
                  />
                  <button
                    type="button"
                    onClick={() => apagar(i)}
                    title="Tirar do roteiro"
                    className="rounded p-1.5 text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {expandida && (
                <div className="mt-2.5 space-y-2 rounded-lg bg-slate-50 p-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Pergunta, como é feita em voz alta</Label>
                    <Textarea
                      rows={2}
                      value={p.pergunta}
                      onChange={(e) => mexer(i, "pergunta", e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px]">
                      O que o entrevistador deve procurar na resposta
                    </Label>
                    <Textarea
                      rows={2}
                      value={p.procurar}
                      onChange={(e) => mexer(i, "procurar", e.target.value)}
                      className="text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Só aparece ao entrevistador. Nunca vai no email nem na ficha do candidato.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Bloco</Label>
                      <select
                        value={p.bloco}
                        onChange={(e) => mexer(i, "bloco", e.target.value as Bloco)}
                        className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                      >
                        <option value="tecnica">{NOME_BLOCO.tecnica}</option>
                        <option value="comportamental">{NOME_BLOCO.comportamental}</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px]">A quem se faz</Label>
                      <select
                        value={p.grupo ?? "ambos"}
                        onChange={(e) => mexer(i, "grupo", e.target.value as GrupoPergunta)}
                        className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                      >
                        {GRUPOS_PERGUNTA.map((g) => (
                          <option key={g} value={g}>
                            {NOME_GRUPO[g]}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-muted-foreground">
                        Mudar isto passa a pergunta para outra coluna.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
