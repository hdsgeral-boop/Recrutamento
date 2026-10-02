"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search, Sparkles, UserMinus, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { atribuirCandidatos, removerAtribuicao } from "@/app/admin/accoes-atribuicao";
import { MAXIMO_RECRUTADORES, validarEquipa } from "@/lib/entrevista/equipa";
import { DEFINICOES_ESTADO } from "@/lib/entrevista/estados";
import { NOME_GRUPO } from "@/lib/entrevista/experiencia";
import type { LinhaEntrevista } from "@/lib/entrevista/atribuicoes";

/**
 * ===========================================================================
 * ATRIBUIR CANDIDATOS A RECRUTADORES
 * ---------------------------------------------------------------------------
 * Escolher gente à esquerda, escolher o recrutador à direita, atribuir.
 *
 * A lista da esquerda mostra por omissão quem AINDA NÃO TEM recrutador, que é
 * o trabalho que falta fazer. Quem já tem aparece com o nome de quem o
 * entrevista, e reatribuir substitui em vez de duplicar.
 * ===========================================================================
 */

export interface Recrutador {
  utilizador: string;
  nome: string;
  papel: string;
  atribuidos: number;
}

export function AtribuirRecrutadores({
  linhas,
  recrutadores,
}: {
  linhas: LinhaEntrevista[];
  recrutadores: Recrutador[];
}) {
  const router = useRouter();

  const [procura, setProcura] = useState("");
  const [so, setSo] = useState<"por_atribuir" | "todos" | string>("por_atribuir");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  // Uma LISTA e não um Set: a ordem importa, porque o primeiro escolhido é o
  // responsável pela entrevista e é ele que fica na coluna de sempre.
  const [equipa, setEquipa] = useState<string[]>(
    recrutadores[0] ? [recrutadores[0].utilizador] : []
  );
  const responsavel = equipa[0] ?? "";
  const [quantos, setQuantos] = useState("");
  const [porPagina, setPorPagina] = useState(25);
  const [pagina, setPagina] = useState(1);
  const [aCorrer, setACorrer] = useState(false);

  const visiveis = useMemo(() => {
    const termo = procura.trim().toLowerCase();
    return linhas.filter((l) => {
      if (so === "por_atribuir" && l.recrutador) return false;
      if (so !== "por_atribuir" && so !== "todos" && l.recrutador !== so) return false;
      if (!termo) return true;
      return (
        l.nome.toLowerCase().includes(termo) ||
        l.municipio.toLowerCase().includes(termo) ||
        (l.recrutador ?? "").toLowerCase().includes(termo)
      );
    });
  }, [linhas, procura, so]);

  /**
   * A página que se está a ver.
   *
   * A paginação é só do ecrã: a selecção e a atribuição continuam a valer
   * para tudo o que estiver escolhido, mesmo noutras páginas. Escolher 40
   * pessoas e depois mudar de página não pode desfazer a escolha.
   */
  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const daPagina = visiveis.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  const escolhidosVisiveis = visiveis.filter((l) => escolhidos.has(l.candidatoId)).length;

  const trocar = (id: string) =>
    setEscolhidos((antes) => {
      const novo = new Set(antes);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const todosEscolhidos = visiveis.length > 0 && visiveis.every((l) => escolhidos.has(l.candidatoId));

  /** Quem ainda não tem recrutador, por ordem de classificação. */
  const porAtribuir = useMemo(
    () =>
      linhas
        .filter((l) => !l.recrutador)
        .sort((a, b) => (b.pontuacaoPerfil ?? -1) - (a.pontuacaoPerfil ?? -1) || a.nome.localeCompare(b.nome)),
    [linhas]
  );

  /**
   * Escolhe os N primeiros de quem ainda não tem recrutador.
   *
   * A ordem é a da classificação, e não a da lista no ecrã: pedir "os
   * próximos 20" quer dizer os 20 melhores que ainda estão por atribuir, não
   * os 20 que calharam estar no topo do que se está a ver.
   *
   * SUBSTITUI a selecção em vez de somar. Escrever 20 e depois 10 tem de dar
   * 10 pessoas, senão o número que se escreveu passa a não querer dizer nada.
   */
  function escolherQuantidade() {
    const n = Math.floor(Number(quantos));
    if (!Number.isFinite(n) || n < 1) return toast.error("Escreve quantos candidatos queres.");

    const apanhados = porAtribuir.slice(0, n);
    if (apanhados.length === 0) return toast.error("Não há candidatos por atribuir.");

    setEscolhidos(new Set(apanhados.map((l) => l.candidatoId)));
    // Mostrar a selecção: o filtro salta para "os que faltam" se estiver noutro
    // sítio, senão escolhiam-se pessoas que não se veem.
    setSo("por_atribuir");
    setProcura("");

    if (apanhados.length < n) {
      toast.warning(`Só há ${apanhados.length} por atribuir. Foram escolhidos esses.`);
    } else {
      toast.success(`${n} candidato(s) escolhido(s), por ordem de classificação.`);
    }
  }

  /** Liga ou desliga um recrutador na equipa, respeitando o tecto de três. */
  const alternarRecrutador = (utilizador: string) =>
    setEquipa((antes) => {
      if (antes.includes(utilizador)) return antes.filter((u) => u !== utilizador);
      if (antes.length >= MAXIMO_RECRUTADORES) {
        toast.warning(`No máximo ${MAXIMO_RECRUTADORES} recrutadores por entrevista.`);
        return antes;
      }
      return [...antes, utilizador];
    });

  const trocarTodos = () =>
    setEscolhidos((antes) => {
      const novo = new Set(antes);
      if (todosEscolhidos) visiveis.forEach((l) => novo.delete(l.candidatoId));
      else visiveis.forEach((l) => novo.add(l.candidatoId));
      return novo;
    });

  async function atribuir() {
    const ids = [...escolhidos];
    if (ids.length === 0) return toast.error("Escolhe pelo menos um candidato.");

    const validada = validarEquipa(equipa);
    if (!validada.ok) return toast.error(validada.erro!);

    const nomes = validada.equipa.map(
      (u) => recrutadores.find((r) => r.utilizador === u)?.nome ?? u
    );

    // Já ter equipa não é o mesmo que ter a MESMA equipa: só se avisa quando
    // a atribuição vai mesmo substituir gente.
    const mesma = (l: { recrutadores: string[] }) =>
      l.recrutadores.length === validada.equipa.length &&
      l.recrutadores.every((u, i) => u === validada.equipa[i]);

    const jaTinham = linhas.filter(
      (l) => escolhidos.has(l.candidatoId) && l.recrutadores.length > 0 && !mesma(l)
    );

    if (jaTinham.length > 0) {
      const seguir = window.confirm(
        `${jaTinham.length} destes candidatos já têm outra equipa. Atribuir passa-os para ${nomes.join(", ")}. Continuar?`
      );
      if (!seguir) return;
    }

    setACorrer(true);
    try {
      const r = await atribuirCandidatos(ids, validada.equipa);
      r.ok ? toast.success(r.mensagem) : toast.error(r.mensagem);
      if (r.ok) {
        setEscolhidos(new Set());
        router.refresh();
      }
    } finally {
      setACorrer(false);
    }
  }

  async function remover() {
    const ids = [...escolhidos];
    if (ids.length === 0) return toast.error("Escolhe pelo menos um candidato.");
    if (!window.confirm(`Retirar a atribuição de ${ids.length} candidato(s)? As avaliações já guardadas não se apagam.`)) return;

    setACorrer(true);
    try {
      const r = await removerAtribuicao(ids);
      r.ok ? toast.success(r.mensagem) : toast.error(r.mensagem);
      if (r.ok) {
        setEscolhidos(new Set());
        router.refresh();
      }
    } finally {
      setACorrer(false);
    }
  }

  if (recrutadores.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="font-semibold text-amber-900">Ainda não há recrutadores</p>
        <p className="mt-1 text-sm text-amber-800">
          Recrutador não é um papel novo: é uma função que se liga a uma conta que já existe, em{" "}
          <strong>Utilizadores</strong>. Liga-a a um administrador, gestor ou editor e ele passa a
          aparecer nesta lista.
        </p>
      </div>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
      {/* ================================================= ESQUERDA ======= */}
      <div className="min-w-0 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-9 pl-8"
              placeholder="Procurar por nome, município ou recrutador"
              value={procura}
              onChange={(e) => {
                setProcura(e.target.value);
                setPagina(1);
              }}
            />
          </div>

          <select
            value={so}
            onChange={(e) => {
              setSo(e.target.value);
              setPagina(1);
            }}
            className="h-9 rounded-md border border-input bg-white px-2 text-sm"
          >
            <option value="por_atribuir">Só os que faltam</option>
            <option value="todos">Todos</option>
            {recrutadores.map((r) => (
              <option key={r.utilizador} value={r.utilizador}>
                Os de {r.nome}
              </option>
            ))}
          </select>
        </div>

        {/* ---------------------------------------- ESCOLHER POR NÚMERO -- */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-sky-700" />
          <Label htmlFor="quantos" className="text-xs font-medium text-sky-900">
            Escolher os próximos
          </Label>
          <Input
            id="quantos"
            type="number"
            min={1}
            max={porAtribuir.length || 1}
            value={quantos}
            onChange={(e) => setQuantos(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && escolherQuantidade()}
            placeholder="20"
            className="h-8 w-[84px] bg-white text-center"
          />
          <span className="text-xs text-sky-900">por atribuir</span>

          <Button
            size="sm"
            variant="outline"
            className="h-8 border-sky-300 bg-white text-sky-800 hover:bg-sky-100"
            onClick={escolherQuantidade}
          >
            Escolher
          </Button>

          <span className="ml-auto text-[11px] text-sky-800">
            {porAtribuir.length} sem recrutador · por ordem de classificação
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={trocarTodos}
            disabled={visiveis.length === 0}
            className="font-medium text-consulvolt-vermelho hover:underline disabled:opacity-40"
          >
            {todosEscolhidos
              ? `Desmarcar os ${visiveis.length} filtrados`
              : `Escolher os ${visiveis.length} filtrados`}
          </button>

          <span>
            {escolhidos.size > 0 && (
              <>
                {escolhidos.size} escolhido(s)
                {escolhidosVisiveis !== escolhidos.size &&
                  ` · ${escolhidos.size - escolhidosVisiveis} fora deste filtro`}
                {" · "}
                <button type="button" onClick={() => setEscolhidos(new Set())} className="hover:underline">
                  limpar
                </button>
              </>
            )}
          </span>
        </div>

        <ul className="divide-y rounded-xl border bg-white">
          {visiveis.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-muted-foreground">
              {so === "por_atribuir"
                ? "Está tudo atribuído."
                : "Nenhum candidato corresponde a esta procura."}
            </li>
          )}

          {daPagina.map((l) => {
            const activo = escolhidos.has(l.candidatoId);
            return (
              <li key={l.candidatoId}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-colors",
                    activo ? "bg-red-50" : "hover:bg-slate-50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={() => trocar(l.candidatoId)}
                    className="h-4 w-4 shrink-0 accent-[color:var(--consulvolt-vermelho,#c62828)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{l.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {l.municipio}
                      {l.pontuacaoPerfil !== null && ` · ${l.pontuacaoPerfil} pts`}
                      {l.experiencia.grupo !== "indeterminado" && ` · ${NOME_GRUPO[l.experiencia.grupo]}`}
                    </span>
                  </span>

                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", DEFINICOES_ESTADO[l.estado].crachá)}>
                    {DEFINICOES_ESTADO[l.estado].rotulo}
                  </span>

                  {l.recrutador && (
                    <span className="hidden max-w-[120px] shrink-0 truncate text-[11px] text-muted-foreground sm:inline">
                      {l.recrutador}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>

        {/* ------------------------------------------------- PAGINAÇÃO ---- */}
        {visiveis.length > porPagina && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              {(paginaSegura - 1) * porPagina + 1}-{Math.min(paginaSegura * porPagina, visiveis.length)} de{" "}
              {visiveis.length}
            </span>

            <div className="flex items-center gap-1.5">
              <select
                value={porPagina}
                onChange={(e) => {
                  setPorPagina(Number(e.target.value));
                  setPagina(1);
                }}
                className="h-8 rounded-md border border-input bg-white px-1.5 text-xs"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} por página
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={paginaSegura <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                className="rounded-md border px-2 py-1 font-medium transition-colors hover:border-slate-400 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="tabular-nums text-muted-foreground">
                {paginaSegura} / {totalPaginas}
              </span>
              <button
                type="button"
                disabled={paginaSegura >= totalPaginas}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                className="rounded-md border px-2 py-1 font-medium transition-colors hover:border-slate-400 disabled:opacity-40"
              >
                Seguinte
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================== DIREITA ======= */}
      <div className="min-w-0 space-y-3 rounded-xl border bg-slate-50 p-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <Users className="h-3.5 w-3.5" />
          Recrutadores
        </h2>

        <p className="text-xs text-muted-foreground">
          Escolhe de 1 a {MAXIMO_RECRUTADORES}. O primeiro que escolheres é o responsável pela
          entrevista; os outros entrevistam com ele e vêem a mesma ficha.
        </p>

        <div className="space-y-1.5">
          {recrutadores.map((r) => {
            const posicao = equipa.indexOf(r.utilizador);
            const dentro = posicao >= 0;
            const cheia = equipa.length >= MAXIMO_RECRUTADORES;

            return (
              <label
                key={r.utilizador}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors",
                  dentro
                    ? "border-consulvolt-vermelho bg-white"
                    : cheia
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
                      : "cursor-pointer border-slate-200 bg-white hover:border-slate-400"
                )}
              >
                <input
                  type="checkbox"
                  checked={dentro}
                  disabled={!dentro && cheia}
                  onChange={() => alternarRecrutador(r.utilizador)}
                  className="h-4 w-4 shrink-0 accent-[color:var(--consulvolt-vermelho,#c62828)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{r.nome}</span>
                    {posicao === 0 && (
                      <span className="rounded bg-consulvolt-vermelho px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                        Responsável
                      </span>
                    )}
                    {posicao > 0 && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        {posicao + 1}.º
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{r.papel}</span>
                </span>
                <span
                  className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                  title="Entrevistas em que participa"
                >
                  {r.atribuidos}
                </span>
              </label>
            );
          })}
        </div>

        <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {escolhidos.size === 0
              ? "Escolhe candidatos à esquerda."
              : `${escolhidos.size} candidato(s) escolhido(s).`}
          </p>

          <p className="text-xs text-muted-foreground">
            {equipa.length === 0 ? (
              <span className="font-medium text-rose-700">Falta escolher pelo menos um recrutador.</span>
            ) : (
              <>
                Equipa:{" "}
                <strong className="text-slate-900">
                  {equipa
                    .map((u) => recrutadores.find((r) => r.utilizador === u)?.nome ?? u)
                    .join(", ")}
                </strong>
              </>
            )}
          </p>

          <Button
            className="w-full"
            disabled={aCorrer || escolhidos.size === 0 || equipa.length === 0}
            onClick={atribuir}
          >
            {aCorrer ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            <span className="ml-2">Atribuir {escolhidos.size || ""}</span>
          </Button>

          <Button
            variant="outline"
            className="w-full"
            disabled={aCorrer || escolhidos.size === 0}
            onClick={remover}
          >
            <UserMinus className="h-4 w-4" />
            <span className="ml-2">Retirar atribuição</span>
          </Button>
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          Um recrutador vê todos os candidatos mas só entrevista os que lhe forem atribuídos -
          qualquer um da equipa conta. Isso é confirmado no servidor, não só no ecrã.
        </p>
      </div>
    </section>
  );
}
