"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarRange,
  ChevronDown,
  Clock,
  ListOrdered,
  Loader2,
  MailCheck,
  Pencil,
  RotateCcw,
  Search,
  Sparkles,
  TriangleAlert,
  Trash2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { confirmarVagas } from "@/app/admin/accoes-agenda";
import {
  DEFINICAO_POR_ESCOLHER,
  DEFINICOES_MODALIDADE,
  MAXIMO_TENTATIVAS,
  MODALIDADES,
  POR_ESCOLHER,
  validarLinkVideochamada,
  type ModalidadeGravada,
} from "@/lib/entrevista/modalidade";
import { DEFINICOES_FASE, FASES, LOCAIS_SUGERIDOS, type Fase } from "@/lib/constantes-fases";
import {
  distribuir,
  validarParametros,
  vagasPorDia,
  PARAMETROS_PADRAO,
  type ParametrosAgenda,
} from "@/lib/entrevista/agenda";
import { doInputParaIso, hojeEmAngola, isoParaInput, porExtensoComDia } from "@/lib/datas";
import { dataFutura, hojeEmAngola as hojeGuarda, minimoParaInput } from "@/lib/entrevista/quando";

/**
 * ===========================================================================
 * AGENDA DE ENTREVISTAS
 * ---------------------------------------------------------------------------
 * Dois passos, de propósito.
 *
 *  1. ESCOLHER e GERAR. Escolhe-se gente - à mão, ou pelos atalhos do
 *     ranking - e carrega-se em Gerar. Nada sai daqui: a grelha aparece no
 *     ecrã e mais nada acontece.
 *
 *  2. REVER, CORRIGIR e só então CONFIRMAR. A lista gerada é editável linha
 *     a linha: muda-se a hora de quem não pode nesse dia, troca-se a sala,
 *     tira-se quem não devia lá estar. Só o segundo botão escreve e envia.
 *
 * A razão é simples: um engano manda cinquenta emails errados, e emails
 * enviados não se apagam. O computador propõe, a pessoa decide.
 *
 * A grelha é uma função pura dos parâmetros. Mudar uma definição não remenda
 * a proposta antiga - obriga a gerar de novo, e a proposta velha fica
 * marcada como desactualizada até isso acontecer.
 * ===========================================================================
 */

const TAMANHO_LOTE = 5;

/** Nomes dos dias, para os botões. Índice 0 é domingo, como no JavaScript. */
const NOMES_DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Os atalhos do ranking. */
const ATALHOS = [50, 100, 150] as const;

export interface CandidatoDaAgenda {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  municipio: string;
  provincia: string;
  /** Declarou experiência na área na candidatura. */
  experienciaSimilar: boolean | null;
  status: string;
  /** Pontuação da última análise concluída. Null quando ainda não foi analisado. */
  pontuacao: number | null;
  /** A rubrica eliminou-o. Continua escolhível à mão, mas fora dos atalhos. */
  eliminado: boolean;
  /** 1 é o melhor classificado. Null para quem não tem análise ou foi eliminado. */
  posicao: number | null;
}

/** Uma linha da proposta, já editável. */
interface LinhaProposta {
  candidato: CandidatoDaAgenda;
  /** ISO com fuso. */
  inicio: string;
  sala: number;
  /** A equipa mexeu nesta linha à mão. */
  mexida: boolean;
}

/** A hora local de uma marcação, sem depender do fuso de quem está a olhar. */
function horaDaVaga(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Luanda",
  }).format(new Date(iso));
}

/**
 * O dia de uma marcação, com o nome do dia da semana E a data.
 * "sexta-feira" sozinho não chega: numa agenda de duas semanas há duas
 * sextas, e a equipa precisa de saber qual.
 */
function diaPorExtenso(iso: string): string {
  return porExtensoComDia(iso).split(" às ")[0];
}

/** AAAA-MM-DD em hora de Angola, para agrupar. */
function diaDe(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Luanda",
  }).format(new Date(iso));
}

export function AgendaEntrevistas({
  candidatos,
  podeEnviarEmail,
}: {
  candidatos: CandidatoDaAgenda[];
  podeEnviarEmail: boolean;
}) {
  const router = useRouter();

  // ------------------------------------------------------------- QUEM ----
  const [procura, setProcura] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroProvincia, setFiltroProvincia] = useState("todas");
  // Como se faz a entrevista. A videochamada é a omissão porque é a que se
  // remarca: escolher chamada tem consequência para o candidato e tem de ser
  // uma escolha consciente.
  // Por omissão é o candidato que escolhe: foi isso que se pediu, e é a
  // opção que não decide por ele.
  const [modalidade, setModalidade] = useState<ModalidadeGravada>(POR_ESCOLHER);
  const [link, setLink] = useState("");
  const [gerarSala, setGerarSala] = useState(true);
  const [filtroExperiencia, setFiltroExperiencia] = useState<"todos" | "com" | "sem">("todos");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());

  // ------------------------------------------------- COMO SE DISTRIBUI ---
  const [dataInicio, setDataInicio] = useState(hojeEmAngola());
  const [salas, setSalas] = useState(PARAMETROS_PADRAO.salas);
  const [duracao, setDuracao] = useState(PARAMETROS_PADRAO.duracaoMinutos);
  const [intervalo, setIntervalo] = useState(PARAMETROS_PADRAO.intervaloMinutos);
  const [manhaInicio, setManhaInicio] = useState(PARAMETROS_PADRAO.periodos[0].inicio);
  const [manhaFim, setManhaFim] = useState(PARAMETROS_PADRAO.periodos[0].fim);
  const [tardeInicio, setTardeInicio] = useState(PARAMETROS_PADRAO.periodos[1].inicio);
  const [tardeFim, setTardeFim] = useState(PARAMETROS_PADRAO.periodos[1].fim);
  const [comTarde, setComTarde] = useState(true);
  const [dias, setDias] = useState<number[]>([...PARAMETROS_PADRAO.diasDaSemana]);

  // -------------------------------------------------- O QUE SE COMUNICA --
  const [fase, setFase] = useState<Fase>("entrevista");
  const [local, setLocal] = useState<string>(LOCAIS_SUGERIDOS[0]);
  const [notas, setNotas] = useState(DEFINICOES_FASE.entrevista.notas);
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [aplicarEstado, setAplicarEstado] = useState(true);

  // -------------------------------------------------------- A PROPOSTA ---
  const [proposta, setProposta] = useState<LinhaProposta[] | null>(null);
  /** A fotografia das definições no momento em que a proposta foi gerada. */
  const [assinatura, setAssinatura] = useState("");
  const [sobraram, setSobraram] = useState<CandidatoDaAgenda[]>([]);

  const [aCorrer, setACorrer] = useState(false);
  const [feitos, setFeitos] = useState(0);

  const estados = useMemo(
    () => Array.from(new Set(candidatos.map((c) => c.status))).sort(),
    [candidatos]
  );

  // Validado a cada tecla, para o erro aparecer enquanto se escreve e não
  // depois de carregar em enviar.
  const linkOk = useMemo(() => validarLinkVideochamada(link), [link]);

  const provincias = useMemo(
    () => Array.from(new Set(candidatos.map((c) => c.provincia).filter(Boolean))).sort(),
    [candidatos]
  );

  const comExperiencia = useMemo(
    () => candidatos.filter((c) => c.experienciaSimilar === true).length,
    [candidatos]
  );

  const visiveis = useMemo(() => {
    const termo = procura.trim().toLowerCase();
    return candidatos.filter((c) => {
      if (filtroEstado !== "todos" && c.status !== filtroEstado) return false;
      if (filtroProvincia !== "todas" && c.provincia !== filtroProvincia) return false;
      // "sem experiência" apanha também quem não respondeu: para efeitos de
      // quem entrevistar, não ter resposta e ter dito que não é o mesmo.
      if (filtroExperiencia === "com" && c.experienciaSimilar !== true) return false;
      if (filtroExperiencia === "sem" && c.experienciaSimilar === true) return false;
      if (!termo) return true;
      return (
        c.nome.toLowerCase().includes(termo) ||
        c.email.toLowerCase().includes(termo) ||
        c.municipio.toLowerCase().includes(termo)
      );
    });
  }, [candidatos, procura, filtroEstado, filtroProvincia, filtroExperiencia]);

  /** Quem pode entrar nos atalhos do ranking: tem pontuação e não foi eliminado. */
  const classificados = useMemo(
    () => candidatos.filter((c) => c.posicao !== null),
    [candidatos]
  );

  const parametros: ParametrosAgenda = useMemo(
    () => ({
      dataInicio,
      salas,
      duracaoMinutos: duracao,
      intervaloMinutos: intervalo,
      periodos: comTarde
        ? [
            { inicio: manhaInicio, fim: manhaFim },
            { inicio: tardeInicio, fim: tardeFim },
          ]
        : [{ inicio: manhaInicio, fim: manhaFim }],
      diasDaSemana: dias,
      excepcoes: [],
      // Nunca gerar vagas para uma hora que já passou hoje.
      naoAntesDe: new Date().toISOString(),
    }),
    [dataInicio, salas, duracao, intervalo, comTarde, manhaInicio, manhaFim, tardeInicio, tardeFim, dias]
  );

  const erros = useMemo(() => validarParametros(parametros), [parametros]);
  const capacidadeDia = erros.length ? 0 : vagasPorDia(parametros);

  /** Muda quando qualquer coisa que afecta a grelha muda. */
  const assinaturaActual = useMemo(
    () => JSON.stringify({ parametros, escolhidos: [...escolhidos].sort() }),
    [parametros, escolhidos]
  );

  const desactualizada = proposta !== null && assinatura !== assinaturaActual;

  // ------------------------------------------------------------ ESCOLHA --
  const trocar = (id: string) =>
    setEscolhidos((antes) => {
      const novo = new Set(antes);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const todosVisiveisEscolhidos =
    visiveis.length > 0 && visiveis.every((c) => escolhidos.has(c.id));

  const trocarTodos = () =>
    setEscolhidos((antes) => {
      const novo = new Set(antes);
      if (todosVisiveisEscolhidos) visiveis.forEach((c) => novo.delete(c.id));
      else visiveis.forEach((c) => novo.add(c.id));
      return novo;
    });

  /**
   * Os N melhores classificados.
   *
   * SUBSTITUI a escolha em vez de somar. "Os 50 melhores" carregado a seguir
   * a "os 100 melhores" tem de dar 50 pessoas, não 100 - senão o botão mente.
   */
  const escolherMelhores = (n: number) => {
    const topo = classificados.slice(0, n);
    setEscolhidos(new Set(topo.map((c) => c.id)));
    if (topo.length < n) {
      toast.warning(`Só há ${topo.length} candidato(s) com classificação. Foram escolhidos esses.`);
    } else {
      toast.success(`${n} melhores classificados escolhidos.`);
    }
  };

  const trocarDia = (d: number) =>
    setDias((antes) => (antes.includes(d) ? antes.filter((x) => x !== d) : [...antes, d].sort()));

  const mudarFase = (nova: Fase) => {
    const eraPadrao = notas.trim() === DEFINICOES_FASE[fase].notas.trim() || !notas.trim();
    setFase(nova);
    if (eraPadrao) setNotas(DEFINICOES_FASE[nova].notas);
  };

  function reporPadrao() {
    setSalas(PARAMETROS_PADRAO.salas);
    setDuracao(PARAMETROS_PADRAO.duracaoMinutos);
    setIntervalo(PARAMETROS_PADRAO.intervaloMinutos);
    setManhaInicio(PARAMETROS_PADRAO.periodos[0].inicio);
    setManhaFim(PARAMETROS_PADRAO.periodos[0].fim);
    setTardeInicio(PARAMETROS_PADRAO.periodos[1].inicio);
    setTardeFim(PARAMETROS_PADRAO.periodos[1].fim);
    setComTarde(true);
    setDias([...PARAMETROS_PADRAO.diasDaSemana]);
    toast.success("Definições repostas.");
  }

  // ------------------------------------------------------------- GERAR ---
  function gerar() {
    if (erros.length) return toast.error("Corrige as definições antes de gerar.");

    // A ordem de entrada decide quem fica no primeiro dia: melhor
    // classificado primeiro, que é como a lista já vem do servidor.
    const lista = candidatos.filter((c) => escolhidos.has(c.id));
    if (lista.length === 0) return toast.error("Escolhe pelo menos um candidato.");

    const grelha = distribuir(lista, parametros);

    setProposta(
      grelha.marcacoes.map((m) => ({
        candidato: m.candidato,
        inicio: m.vaga.inicio,
        sala: m.vaga.sala,
        mexida: false,
      }))
    );
    setSobraram(grelha.sobram);
    setAssinatura(assinaturaActual);
    setFeitos(0);

    if (grelha.sobram.length > 0) {
      toast.warning(
        `${grelha.marcacoes.length} marcado(s) na proposta. ${grelha.sobram.length} não coube(ram).`
      );
    } else {
      toast.success(`Proposta com ${grelha.marcacoes.length} entrevista(s). Revê antes de enviar.`);
    }
  }

  // -------------------------------------------------- EDITAR A PROPOSTA --
  const mudarHora = (id: string, valorDoInput: string) => {
    const iso = doInputParaIso(valorDoInput);
    if (!iso) return;
    setProposta((antes) =>
      antes!.map((l) => (l.candidato.id === id ? { ...l, inicio: iso, mexida: true } : l))
    );
  };

  const mudarSala = (id: string, sala: number) =>
    setProposta((antes) =>
      antes!.map((l) => (l.candidato.id === id ? { ...l, sala, mexida: true } : l))
    );

  const tirarDaProposta = (id: string) =>
    setProposta((antes) => antes!.filter((l) => l.candidato.id !== id));

  /**
   * Choques criados à mão: duas pessoas na mesma sala à mesma hora.
   *
   * A grelha gerada nunca choca. Só a edição é que pode chocar, e é por isso
   * que este aviso existe: quem muda uma hora à pressa merece que lhe digam.
   */
  const choques = useMemo(() => {
    const vistos = new Map<string, string>();
    const maus = new Set<string>();
    for (const l of proposta ?? []) {
      const chave = `${l.inicio}|${l.sala}`;
      const antes = vistos.get(chave);
      if (antes) {
        maus.add(antes);
        maus.add(l.candidato.id);
      } else {
        vistos.set(chave, l.candidato.id);
      }
    }
    return maus;
  }, [proposta]);

  /** A proposta agrupada por dia, já com as edições da equipa. */
  const porDia = useMemo(() => {
    const mapa = new Map<string, LinhaProposta[]>();
    for (const l of proposta ?? []) {
      const d = diaDe(l.inicio);
      const lista = mapa.get(d) ?? [];
      lista.push(l);
      mapa.set(d, lista);
    }
    return [...mapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, linhas]) => ({
        dia,
        linhas: linhas.sort(
          (x, y) => x.inicio.localeCompare(y.inicio) || x.sala - y.sala
        ),
      }));
  }, [proposta]);

  // ---------------------------------------------------------- CONFIRMAR --
  async function confirmar() {
    if (!proposta || proposta.length === 0) return toast.error("Não há nada para marcar.");
    if (!local.trim()) return toast.error("Indica o local.");

    // Um link partido num lote de cinquenta são cinquenta pessoas à porta de
    // uma sala que não existe, e ninguém dá por isso até à hora da entrevista.
    if (modalidade === "videochamada" && !gerarSala && !linkOk.ok) {
      return toast.error(linkOk.erro!);
    }

    // Editar uma linha à mão pode pô-la no passado. O servidor recusa na
    // mesma, mas descobrir isso a meio de um lote de cinquenta é tarde.
    const passadas = proposta.filter((l) => !dataFutura(l.inicio).ok);
    if (passadas.length > 0) {
      return toast.error(
        `${passadas.length} marcação(ões) ficaram no passado: ${passadas
          .slice(0, 3)
          .map((l) => l.candidato.nome)
          .join(", ")}${passadas.length > 3 ? "..." : ""}. Corrige a hora antes de enviar.`
      );
    }

    if (choques.size > 0) {
      const seguir = window.confirm(
        `${choques.size} pessoa(s) ficaram na mesma sala à mesma hora. ` +
          "Isso foi feito à mão, não pela agenda. Queres mesmo continuar?"
      );
      if (!seguir) return;
    }

    const nDias = new Set(proposta.map((l) => diaDe(l.inicio))).size;

    const confirmado = window.confirm(
      `Vais marcar ${DEFINICOES_FASE[fase].rotulo.toLowerCase()} para ${proposta.length} candidato(s), ` +
        `distribuídos por ${nDias} dia(s), em ${local}.` +
        (enviarEmail && podeEnviarEmail
          ? " Cada um recebe um email com a SUA hora. Emails enviados não se apagam."
          : " Sem emails.") +
        " Continuar?"
    );
    if (!confirmado) return;

    setACorrer(true);
    setFeitos(0);

    let marcados = 0;
    let emails = 0;
    const problemas: string[] = [];

    const pedidos = proposta.map((l) => ({
      id: l.candidato.id,
      inicio: l.inicio,
      sala: l.sala,
    }));

    try {
      for (let i = 0; i < pedidos.length; i += TAMANHO_LOTE) {
        const r = await confirmarVagas({
          vagas: pedidos.slice(i, i + TAMANHO_LOTE),
          fase,
          local,
          notas,
          enviarEmail: enviarEmail && podeEnviarEmail,
          aplicarEstado,
          totalSalas: salas,
          // O tempo de cada vaga é também o tempo previsto da entrevista.
          duracaoMinutos: duracao,
          modalidade,
          link: modalidade === "chamada" || gerarSala ? null : link.trim(),
          gerarSala: gerarSala && modalidade !== "chamada",
        });

        marcados += r.marcados;
        emails += r.emailsEnviados;
        problemas.push(...r.problemas);
        setFeitos(Math.min(i + TAMANHO_LOTE, pedidos.length));

        if (i + TAMANHO_LOTE < pedidos.length) await new Promise((r) => setTimeout(r, 400));
      }

      if (problemas.length === 0) {
        toast.success(
          enviarEmail && podeEnviarEmail
            ? `${marcados} marcado(s) e ${emails} email(s) enviado(s).`
            : `${marcados} marcado(s), sem emails.`
        );
      } else {
        toast.warning(`${marcados} marcado(s), ${problemas.length} com problema.`);
        console.warn("[agenda]", problemas);
      }

      setEscolhidos(new Set());
      setProposta(null);
      setSobraram([]);
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "A marcação foi interrompida.");
    } finally {
      setACorrer(false);
    }
  }

  const total = escolhidos.size;
  const percentagem = proposta?.length ? Math.round((feitos / proposta.length) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-3 py-3 sm:px-4">
        <CalendarRange className="h-4 w-4 shrink-0 text-consulvolt-vermelho" />
        <h2 className="text-sm font-semibold">Agenda de entrevistas</h2>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Escolher, gerar, corrigir, e só depois enviar
        </span>
        {total > 0 && (
          <span className="ml-auto rounded-full bg-consulvolt-vermelho px-2.5 py-0.5 text-xs font-semibold text-white">
            {total} escolhido{total > 1 ? "s" : ""}
          </span>
        )}
      </header>

      <div className="grid gap-5 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        {/* ============================================ ESQUERDA ========== */}
        <div className="min-w-0 space-y-4">
          {/* --------------------------------------------- DEFINIÇÕES ---- */}
          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <Clock className="h-3.5 w-3.5" />
                1. Como se distribui
              </h3>
              <button
                type="button"
                onClick={reporPadrao}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-consulvolt-vermelho hover:underline"
              >
                <RotateCcw className="h-3 w-3" />
                Repor
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="ag-inicio" className="text-[11px]">
                  Começa a
                </Label>
                <Input
                  id="ag-inicio"
                  type="date"
                  // O browser deixa de oferecer dias passados no calendário:
                  // evitar o erro vale mais do que o corrigir depois.
                  min={hojeGuarda()}
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ag-salas" className="text-[11px]">
                  Salas
                </Label>
                <Input
                  id="ag-salas"
                  type="number"
                  min={1}
                  max={20}
                  value={salas}
                  onChange={(e) => setSalas(Number(e.target.value))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ag-duracao" className="text-[11px]">
                  Minutos cada
                </Label>
                <Input
                  id="ag-duracao"
                  type="number"
                  min={5}
                  max={240}
                  step={5}
                  value={duracao}
                  onChange={(e) => setDuracao(Number(e.target.value))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ag-intervalo" className="text-[11px]">
                  Folga entre
                </Label>
                <Input
                  id="ag-intervalo"
                  type="number"
                  min={0}
                  max={120}
                  step={5}
                  value={intervalo}
                  onChange={(e) => setIntervalo(Number(e.target.value))}
                  className="h-9"
                />
              </div>
            </div>

            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Manhã</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="time"
                    value={manhaInicio}
                    onChange={(e) => setManhaInicio(e.target.value)}
                    className="h-9"
                  />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input
                    type="time"
                    value={manhaFim}
                    onChange={(e) => setManhaFim(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium">
                  <input
                    type="checkbox"
                    checked={comTarde}
                    onChange={(e) => setComTarde(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Tarde
                </label>
                <div className={cn("flex items-center gap-1.5", !comTarde && "opacity-40")}>
                  <Input
                    type="time"
                    value={tardeInicio}
                    disabled={!comTarde}
                    onChange={(e) => setTardeInicio(e.target.value)}
                    className="h-9"
                  />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input
                    type="time"
                    value={tardeFim}
                    disabled={!comTarde}
                    onChange={(e) => setTardeFim(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            <div className="mt-2.5 space-y-1">
              <Label className="text-[11px]">Dias em que se entrevista</Label>
              <div className="flex flex-wrap gap-1.5">
                {NOMES_DIAS.map((nome, i) => (
                  <button
                    key={nome}
                    type="button"
                    onClick={() => trocarDia(i)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      dias.includes(i)
                        ? "border-transparent bg-consulvolt-vermelho text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                    )}
                  >
                    {nome}
                  </button>
                ))}
              </div>
            </div>

            {erros.length > 0 ? (
              <ul className="mt-2.5 space-y-0.5 rounded-md bg-rose-50 p-2 text-xs text-rose-800">
                {erros.map((e) => (
                  <li key={e} className="flex items-start gap-1.5">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2.5 text-xs text-muted-foreground">
                Com estas definições cabem <strong>{capacidadeDia}</strong> entrevistas por dia
                ({salas} sala{salas > 1 ? "s" : ""} × {duracao} min).
              </p>
            )}
          </div>

          {/* --------------------------------------------- QUEM ---------- */}
          <div className="space-y-2.5">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <Users className="h-3.5 w-3.5" />
              2. Quem
            </h3>

            {/* Atalhos do ranking. */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 p-2">
              <ListOrdered className="h-3.5 w-3.5 shrink-0 text-sky-700" />
              <span className="text-xs font-medium text-sky-900">Pelo ranking:</span>
              {ATALHOS.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={classificados.length === 0}
                  onClick={() => escolherMelhores(n)}
                  className="rounded-md border border-sky-300 bg-white px-2.5 py-1 text-xs font-semibold text-sky-800 transition-colors hover:bg-sky-100 disabled:opacity-40"
                >
                  {n} melhores
                </button>
              ))}
              <span className="ml-auto text-[11px] text-sky-800">
                {classificados.length > 0
                  ? `${classificados.length} classificado(s)`
                  : "ainda sem análises"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-9 pl-8"
                  placeholder="Procurar por nome, email ou município"
                  value={procura}
                  onChange={(e) => setProcura(e.target.value)}
                />
              </div>

              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="h-9 rounded-md border border-input bg-white px-2 text-sm"
              >
                <option value="todos">Todos os estados</option>
                {estados.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>

              <select
                value={filtroProvincia}
                onChange={(e) => setFiltroProvincia(e.target.value)}
                className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                aria-label="Filtrar por província"
              >
                <option value="todas">Todas as províncias</option>
                {provincias.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              <select
                value={filtroExperiencia}
                onChange={(e) => setFiltroExperiencia(e.target.value as "todos" | "com" | "sem")}
                className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                aria-label="Filtrar por experiência"
              >
                <option value="todos">Com e sem experiência</option>
                <option value="com">Só com experiência ({comExperiencia})</option>
                <option value="sem">Só sem experiência ({candidatos.length - comExperiencia})</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={trocarTodos}
                disabled={visiveis.length === 0}
                className="font-medium text-consulvolt-vermelho hover:underline disabled:opacity-40"
              >
                {todosVisiveisEscolhidos
                  ? `Desmarcar os ${visiveis.length} visíveis`
                  : `Escolher os ${visiveis.length} visíveis`}
              </button>

              {total > 0 && (
                <button
                  type="button"
                  onClick={() => setEscolhidos(new Set())}
                  className="hover:underline"
                >
                  Limpar selecção
                </button>
              )}
            </div>

            <ul className="max-h-[260px] divide-y overflow-y-auto rounded-lg border">
              {visiveis.length === 0 && (
                <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nenhum candidato corresponde a esta procura.
                </li>
              )}

              {visiveis.map((c) => {
                const activo = escolhidos.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-colors",
                        activo ? "bg-red-50" : "hover:bg-slate-50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={activo}
                        onChange={() => trocar(c.id)}
                        className="h-4 w-4 shrink-0 accent-[color:var(--consulvolt-vermelho,#c62828)]"
                      />
                      <span className="w-9 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                        {c.posicao ? `${c.posicao}.º` : "-"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.municipio} · {c.email}
                        </span>
                      </span>
                      {c.pontuacao !== null && (
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                            c.eliminado
                              ? "bg-rose-100 text-rose-800"
                              : "bg-slate-100 text-slate-700"
                          )}
                        >
                          {c.eliminado ? "eliminado" : `${c.pontuacao} pts`}
                        </span>
                      )}
                      <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 sm:inline">
                        {c.status}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <Button
              variant="outline"
              className="w-full border-consulvolt-vermelho text-consulvolt-vermelho hover:bg-red-50"
              disabled={total === 0 || erros.length > 0}
              onClick={gerar}
            >
              <Sparkles className="h-4 w-4" />
              <span className="ml-2">
                {total === 0
                  ? "Escolhe candidatos para gerar"
                  : `Gerar lista para ${total} candidato(s)`}
              </span>
            </Button>
          </div>

          {/* --------------------------------------------- A PROPOSTA ---- */}
          {proposta && (
            <div className="space-y-2">
              <h3 className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <Pencil className="h-3.5 w-3.5" />
                3. Revê e corrige
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-sky-800">
                  {proposta.length} em {porDia.length} dia{porDia.length > 1 ? "s" : ""}
                </span>
              </h3>

              <p className="text-[11px] leading-snug text-muted-foreground">
                Muda a hora de quem não pode, troca a sala, ou tira alguém da lista. Nada foi
                escrito nem enviado: isto é só uma proposta.
              </p>

              {desactualizada && (
                <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Mexeste nas definições ou na escolha depois de gerar. Esta lista é a
                    anterior - carrega outra vez em <strong>Gerar lista</strong> para a pôr a
                    par.
                  </span>
                </p>
              )}

              {proposta.some((l) => !dataFutura(l.inicio).ok) && (
                <p className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Há marcações com uma hora que <strong>já passou</strong>. Estão a vermelho.
                    Corrige-as: o sistema não deixa enviar uma convocatória para um dia que já foi.
                  </span>
                </p>
              )}

              {choques.size > 0 && (
                <p className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>{choques.size}</strong> pessoa(s) ficaram na mesma sala à mesma hora,
                    por causa de uma edição à mão. Estão marcadas a vermelho.
                  </span>
                </p>
              )}

              {sobraram.length > 0 && (
                <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>{sobraram.length}</strong> candidato(s) não coube(ram) no horizonte e
                    ficaram de fora: {sobraram.slice(0, 4).map((c) => c.nome).join(", ")}
                    {sobraram.length > 4 && `, e mais ${sobraram.length - 4}`}. Abre mais salas,
                    encurta a entrevista, ou marca-os depois.
                  </span>
                </p>
              )}

              <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-lg border p-2">
                {porDia.map(({ dia, linhas }) => (
                  <details key={dia} open className="rounded-md border bg-slate-50">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-xs font-semibold">
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="min-w-0 truncate first-letter:uppercase">
                        {diaPorExtenso(linhas[0].inicio)}
                      </span>
                      <span className="ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {linhas.length}
                      </span>
                    </summary>

                    <ul className="divide-y border-t bg-white">
                      {linhas.map((l) => {
                        const choca = choques.has(l.candidato.id);
                        const passada = !dataFutura(l.inicio).ok;
                        return (
                          <li
                            key={l.candidato.id}
                            className={cn(
                              "flex flex-wrap items-center gap-2 px-2.5 py-2 text-xs",
                              (choca || passada) && "bg-rose-50"
                            )}
                          >
                            <input
                              type="datetime-local"
                              value={isoParaInput(l.inicio)}
                              min={minimoParaInput()}
                              onChange={(e) => mudarHora(l.candidato.id, e.target.value)}
                              title={passada ? "Esta hora já passou" : undefined}
                              className={cn(
                                "h-8 shrink-0 rounded-md border bg-white px-1.5 font-mono text-xs",
                                choca || passada ? "border-rose-400 text-rose-800" : "border-input"
                              )}
                            />

                            {salas > 1 && (
                              <select
                                value={l.sala}
                                onChange={(e) =>
                                  mudarSala(l.candidato.id, Number(e.target.value))
                                }
                                className={cn(
                                  "h-8 shrink-0 rounded-md border bg-white px-1 text-xs",
                                  choca ? "border-rose-400" : "border-input"
                                )}
                              >
                                {Array.from({ length: salas }, (_, i) => i + 1).map((s) => (
                                  <option key={s} value={s}>
                                    Sala {s}
                                  </option>
                                ))}
                              </select>
                            )}

                            <span className="min-w-0 flex-1 basis-[140px]">
                              <span className="block truncate font-medium">
                                {l.candidato.posicao ? `${l.candidato.posicao}.º · ` : ""}
                                {l.candidato.nome}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {l.candidato.municipio}
                                {l.candidato.pontuacao !== null && ` · ${l.candidato.pontuacao} pts`}
                                {l.mexida && " · alterado à mão"}
                              </span>
                            </span>

                            <button
                              type="button"
                              title="Tirar da lista"
                              onClick={() => tirarDaProposta(l.candidato.id)}
                              className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                ))}

                {proposta.length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Tiraste toda a gente da lista. Gera outra vez, ou escolhe outros candidatos.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ============================================ DIREITA =========== */}
        <div className="min-w-0 space-y-3 rounded-lg border bg-slate-50 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            O que o candidato recebe
          </h3>

          <div className="space-y-1.5">
            <Label className="text-xs">Fase</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {FASES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => mudarFase(f)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                    fase === f
                      ? "border-transparent " + DEFINICOES_FASE[f].crachá
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                  )}
                >
                  {DEFINICOES_FASE[f].rotulo}
                </button>
              ))}
            </div>
          </div>

          {/* ------------------------------------------ MODALIDADE -------- */}
          <div className="space-y-1.5">
            <Label className="text-xs">Como se faz a entrevista</Label>
            <button
              type="button"
              onClick={() => setModalidade(POR_ESCOLHER)}
              className={cn(
                "w-full rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                modalidade === POR_ESCOLHER
                  ? "border-transparent " + DEFINICAO_POR_ESCOLHER.crachá
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              )}
            >
              O candidato escolhe (responde ao email)
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              {MODALIDADES.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setModalidade(k)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                    modalidade === k
                      ? "border-transparent " + DEFINICOES_MODALIDADE[k].crachá
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                  )}
                >
                  {DEFINICOES_MODALIDADE[k].rotulo}
                </button>
              ))}
            </div>

            <p className="rounded-md bg-white px-2 py-1.5 text-[11px] leading-snug text-muted-foreground ring-1 ring-slate-200">
              {modalidade === POR_ESCOLHER
                ? "O email leva as duas opções explicadas e pede ao candidato que responda a dizer qual prefere. A escolha regista-se depois na ficha dele."
                : DEFINICOES_MODALIDADE[modalidade].explicacao}
            </p>

            {modalidade !== "chamada" && (
              <label
                htmlFor="ag-gerar-sala"
                className="flex cursor-pointer items-start gap-2 rounded-md bg-white px-2 py-1.5 text-[11px] leading-snug ring-1 ring-slate-200"
              >
                <input
                  id="ag-gerar-sala"
                  type="checkbox"
                  checked={gerarSala}
                  onChange={(e) => setGerarSala(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5"
                />
                <span>
                  <strong className="block text-slate-800">Criar uma sala do Meet por candidato</strong>
                  <span className="text-muted-foreground">
                    Pela API do Google Calendar, cada um com a sua sala à hora dele. Sem isto, colas
                    um link só, igual para toda a gente.
                  </span>
                </span>
              </label>
            )}

            {modalidade === "videochamada" && !gerarSala ? (
              <div className="space-y-1">
                <Label htmlFor="ag-link" className="text-xs">
                  Link do Google Meet
                </Label>
                <Input
                  id="ag-link"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://meet.google.com/abc-defg-hij"
                  className={cn("h-9", link && !linkOk.ok && "border-rose-400 bg-rose-50")}
                />
                {link && !linkOk.ok ? (
                  <p className="text-[11px] font-medium text-rose-700">{linkOk.erro}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Cria a sala no Google Meet e cola aqui o link. É o mesmo para todo o lote, e
                    vai no email de cada candidato.
                  </p>
                )}
              </div>
            ) : modalidade === "chamada" ? (
              <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900 ring-1 ring-amber-200">
                Ligam-se até {MAXIMO_TENTATIVAS} vezes para o número da candidatura. Esgotadas as{" "}
                {MAXIMO_TENTATIVAS} sem atender, <strong>o sistema não deixa remarcar</strong>. Cada
                tentativa regista-se na ficha do candidato.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-local" className="text-xs">
              Local
            </Label>
            <Input
              id="ag-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              list="locais-agenda"
              placeholder="Onde se realiza"
              className="h-9"
            />
            <datalist id="locais-agenda">
              {LOCAIS_SUGERIDOS.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-notas" className="text-xs">
              Indicações para o candidato
            </Label>
            <Textarea
              id="ag-notas"
              rows={4}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="text-sm"
            />
            {salas > 1 && (
              <p className="text-[11px] text-muted-foreground">
                A sala de cada um é acrescentada automaticamente ao email.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Os <strong>{duracao} minutos</strong> de cada entrevista ficam guardados para o
              relógio do entrevistador. <strong>O candidato não os vê</strong> no email.
            </p>
          </div>

          <div className="space-y-2 border-t pt-2.5">
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={enviarEmail && podeEnviarEmail}
                disabled={!podeEnviarEmail}
                onChange={(e) => setEnviarEmail(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
              />
              <span className={cn(!podeEnviarEmail && "text-muted-foreground")}>
                Enviar a cada candidato um email com a <strong>sua</strong> hora
                {!podeEnviarEmail && " (o teu papel não permite enviar emails)"}
              </span>
            </label>

            {DEFINICOES_FASE[fase].estadoSugerido && (
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={aplicarEstado}
                  onChange={(e) => setAplicarEstado(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span>
                  Passar o estado para <strong>{DEFINICOES_FASE[fase].estadoSugerido}</strong>
                </span>
              </label>
            )}
          </div>

          <Button
            className="w-full"
            disabled={aCorrer || !proposta || proposta.length === 0}
            onClick={confirmar}
          >
            {aCorrer ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : enviarEmail && podeEnviarEmail ? (
              <MailCheck className="h-4 w-4" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            <span className="ml-2">
              {aCorrer
                ? `${feitos} de ${proposta?.length ?? 0}`
                : !proposta || proposta.length === 0
                  ? "Gera a lista primeiro"
                  : enviarEmail && podeEnviarEmail
                    ? `Confirmar e enviar ${proposta.length} email(s)`
                    : `Confirmar ${proposta.length} marcação(ões)`}
            </span>
          </Button>

          {aCorrer && (
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-consulvolt-vermelho transition-all"
                style={{ width: `${percentagem}%` }}
              />
            </div>
          )}

          <p className="text-[11px] leading-snug text-muted-foreground">
            Este botão só acorda depois de gerares a lista. É ele, e só ele, que escreve na
            base de dados e manda os emails.
          </p>
        </div>
      </div>
    </section>
  );
}
