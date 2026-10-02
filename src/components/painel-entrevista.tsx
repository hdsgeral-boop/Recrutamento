"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  ClipboardCheck,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  Phone,
  Printer,
  TriangleAlert,
  Users2,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { guardarAvaliacao } from "@/app/admin/accoes-entrevista";
import { pontuarEntrevista, escalaoDaNota, type Respostas } from "@/lib/entrevista/pontuacao";
import { doInputParaIso } from "@/lib/datas";
import {
  ESCALA,
  MARCACOES,
  NOME_BLOCO,
  type Bloco,
  type Marcacao,
  type Pergunta,
} from "@/lib/entrevista/roteiro";
import {
  NOME_GRUPO,
  perguntaServe,
  type Classificacao,
  type GrupoExperiencia,
} from "@/lib/entrevista/experiencia";
import {
  definirGrupo,
  finalizarEntrevista,
  mudarEstado,
  reagendarEntrevista,
} from "@/app/admin/accoes-atribuicao";
import { CaixaReagendar, RelogioEntrevista } from "@/components/relogio-entrevista";
import { POR_ESCOLHER, type ModalidadeGravada } from "@/lib/entrevista/modalidade";
import { LerFicha } from "@/components/ler-ficha";
import { isoParaInput } from "@/lib/datas";

/**
 * ===========================================================================
 * PAINEL DA ENTREVISTA
 * ---------------------------------------------------------------------------
 * O que o entrevistador tem à frente enquanto conversa: a foto, o resumo do
 * currículo, as perguntas, e três botões por pergunta.
 *
 * A nota que aparece aqui é para orientar quem marca. A que fica gravada é a
 * que o servidor calcula outra vez a partir das marcações - um número vindo
 * do browser nunca é a fonte de verdade de uma avaliação.
 *
 * Uma pergunta por marcar NÃO é um Mau. Sai do total, e a entrevista fica
 * assinalada como incompleta. Marcar mal uma pergunta que não se chegou a
 * fazer seria inventar uma avaliação.
 * ===========================================================================
 */

const RECOMENDACOES = [
  { chave: "avancar", rotulo: "Avançar", classe: "border-emerald-500 text-emerald-700 bg-emerald-50" },
  { chave: "reserva", rotulo: "Reserva", classe: "border-amber-500 text-amber-700 bg-amber-50" },
  { chave: "nao_avancar", rotulo: "Não avançar", classe: "border-rose-500 text-rose-700 bg-rose-50" },
] as const;

type Recomendacao = (typeof RECOMENDACOES)[number]["chave"];

export function PainelEntrevista({
  candidatoId,
  candidatoNome,
  versao,
  perguntas,
  podeEnviarEmail,
  jaAvaliado,
  fichaUrl,
  experiencia,
  quando,
  duracaoMinutos,
  iniciadaEm,
  concluidaEm,
  entrevistaFechada,
  modalidade,
  salaLink,
  telefone,
}: {
  candidatoId: string;
  candidatoNome: string;
  versao: string;
  /** O roteiro inteiro. A filtragem por grupo acontece aqui dentro. */
  perguntas: Pergunta[];
  podeEnviarEmail: boolean;
  /** Com ou sem experiência de cadastro, e de onde veio a decisão. */
  experiencia: Classificacao;
  /** Data marcada, para o campo de reagendar já vir preenchido. */
  quando: string | null;
  /** Minutos previstos. Definidos na marcação; o candidato não os vê. */
  duracaoMinutos: number | null;
  /** Quando a entrevista foi marcada como começada. Null = ainda não começou. */
  iniciadaEm: string | null;
  /** Quando foi dada por concluída. A partir daqui o relógio pára. */
  concluidaEm: string | null;
  /** O processo está fechado, mesmo que a hora de fim não tenha ficado. */
  entrevistaFechada: boolean;
  /** Como se faz: videochamada, chamada, ou ainda por escolher. */
  modalidade: ModalidadeGravada | null;
  /** A sala do Meet deste candidato. É o que o recrutador abre para começar. */
  salaLink: string | null;
  /** Para a chamada telefónica se poder marcar daqui. */
  telefone: string;
  /** Avaliações anteriores, da mais recente para a mais antiga. */
  jaAvaliado: { nota: number; versao: string; quando: string; avaliador: string | null }[];
  fichaUrl: string | null;
}) {
  const router = useRouter();

  /** O grupo em vigor no ecrã. Muda sem recarregar a página. */
  const [grupo, setGrupo] = useState(experiencia.grupo);
  const [aMudarGrupo, setAMudarGrupo] = useState(false);

  /**
   * Só as perguntas que servem este candidato.
   *
   * Com o grupo por decidir ficam só as comuns: fazer as perguntas de um
   * grupo a quem ainda não foi classificado seria escolher por ele, e depois
   * comparar a nota com a de quem respondeu ao outro conjunto.
   */
  const doCandidato = useMemo(
    () => perguntas.filter((p) => perguntaServe(p.grupo, grupo)),
    [perguntas, grupo]
  );

  const [respostas, setRespostas] = useState<Respostas>({});
  const [observacoes, setObservacoes] = useState("");
  const [recomendacao, setRecomendacao] = useState<Recomendacao | null>(null);
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [aGravar, setAGravar] = useState(false);
  const [guardado, setGuardado] = useState<{ nota: number; drive: string | null } | null>(null);

  // O relógio arranca no servidor, não aqui: recarregar a página não pode
  // reiniciar a contagem.
  const [inicio, setInicio] = useState<string | null>(iniciadaEm);
  /**
   * O fim da entrevista, para o relógio parar.
   *
   * Fica em estado local além de vir do servidor porque, ao guardar, o
   * relógio tem de parar NAQUELE instante e não no próximo refresh. Ver o
   * cronómetro continuar a correr depois de carregar em guardar é o que faz
   * quem está a usar duvidar de que a gravação tenha acontecido.
   */
  const [fim, setFim] = useState<string | null>(concluidaEm);
  const [aFinalizar, setAFinalizar] = useState(false);
  const [finalizada, setFinalizada] = useState(false);
  const [aComecar, setAComecar] = useState(false);
  const [aReagendar, setAReagendar] = useState(false);
  const [aGravarData, setAGravarData] = useState(false);

  async function comecar() {
    setAComecar(true);
    try {
      const r = await mudarEstado(candidatoId, "em_entrevista");
      if (!r.ok) return toast.error(r.mensagem);
      // O servidor carimba iniciada_em; usamos o mesmo instante aqui para o
      // relógio não saltar até ao próximo refresh.
      setInicio(new Date().toISOString());
      setFim(null);
      toast.success("Entrevista começada. O relógio está a contar.");
      router.refresh();
    } finally {
      setAComecar(false);
    }
  }

  async function reagendar(valorDoInput: string, novaDuracao: number | null, motivo: string) {
    const iso = doInputParaIso(valorDoInput);
    if (!iso) return toast.error("A data nova não é válida.");

    setAGravarData(true);
    try {
      const r = await reagendarEntrevista(candidatoId, iso, novaDuracao, motivo);
      if (!r.ok) return toast.error(r.mensagem);
      toast.success(r.mensagem);
      setAReagendar(false);
      setInicio(null);
      setFim(null);
      router.refresh();
    } finally {
      setAGravarData(false);
    }
  }

  const resultado = useMemo(
    () => pontuarEntrevista(respostas, doCandidato, versao),
    [respostas, doCandidato, versao]
  );

  const escalao = escalaoDaNota(resultado.nota);
  const porMarcar = doCandidato.length - resultado.respondidas;

  const marcar = (codigo: string, m: Marcacao) =>
    setRespostas((antes) => {
      const novo = { ...antes };
      // Carregar outra vez no mesmo botão desmarca. É a única maneira de
      // corrigir um clique errado sem ficar com uma marcação que não se quis.
      if (novo[codigo] === m) delete novo[codigo];
      else novo[codigo] = m;
      return novo;
    });

  const blocos = useMemo(() => {
    const mapa = new Map<Bloco, Pergunta[]>();
    for (const p of doCandidato) {
      const lista = mapa.get(p.bloco) ?? [];
      lista.push(p);
      mapa.set(p.bloco, lista);
    }
    return [...mapa.entries()];
  }, [doCandidato]);

  /** Corrige o grupo à mão, e limpa as marcações que deixam de existir. */
  async function mudarGrupo(novo: GrupoExperiencia) {
    setAMudarGrupo(true);
    try {
      const r = await definirGrupo(candidatoId, novo);
      if (!r.ok) return toast.error(r.mensagem);

      setGrupo(novo);
      // As marcações de perguntas que saíram do conjunto deixam de contar.
      // Guardá-las era guardar respostas a perguntas que não se fizeram.
      const validas = new Set(
        perguntas.filter((p) => perguntaServe(p.grupo, novo)).map((p) => p.codigo)
      );
      setRespostas((antes) =>
        Object.fromEntries(Object.entries(antes).filter(([c]) => validas.has(c)))
      );
      toast.success(`Passou a ${novo === "com_experiencia" ? "com" : "sem"} experiência.`);
      router.refresh();
    } finally {
      setAMudarGrupo(false);
    }
  }

  /**
   * Finalizar sem avaliação.
   *
   * Separado do guardar de propósito. Guardar diz "isto foi o que ele
   * respondeu"; finalizar diz "isto acabou". São duas afirmações diferentes,
   * e juntá-las num botão só levava alguém a fechar processos a pensar que
   * estava a gravar notas - ou a marcar perguntas que nunca fez só para o
   * sistema o deixar sair dali.
   */
  async function finalizar() {
    const temMarcacoes = resultado.respondidas > 0;

    const porque = window.prompt(
      temMarcacoes
        ? `Vais fechar a entrevista de ${candidatoNome} SEM guardar avaliação. As ${resultado.respondidas} marcação(ões) que estão no ecrã perdem-se. Porquê?`
        : `Vais fechar a entrevista de ${candidatoNome} sem avaliação nenhuma. O processo fica concluído e o relógio pára. Porquê?`,
      temMarcacoes ? "" : "O candidato não compareceu"
    );

    // Cancelar no prompt é cancelar a operação. Um motivo vazio também não
    // serve: daqui a três meses, um processo fechado sem nota e sem razão só
    // se pode ler como esquecimento.
    if (porque === null) return;
    if (!porque.trim()) return toast.error("Escreve o motivo. Fica no histórico do candidato.");

    setAFinalizar(true);
    try {
      const r = await finalizarEntrevista(candidatoId, porque);
      if (!r.ok) return toast.error(r.mensagem);

      toast.success(r.mensagem);
      setFim(new Date().toISOString());
      setFinalizada(true);
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não consegui finalizar.");
    } finally {
      setAFinalizar(false);
    }
  }

  async function gravar() {
    // Zero marcações não é uma avaliação: é uma entrevista que não aconteceu,
    // e para isso há o botão de finalizar. Uma nota ZERO, essa, guarda-se na
    // mesma - tudo marcado como Mau é um resultado, não um engano.
    if (resultado.respondidas === 0) {
      return toast.error("Sem nenhuma pergunta marcada, usa Finalizar entrevista.");
    }

    if (
      !window.confirm(
        `Guardar a entrevista de ${candidatoNome} com ${resultado.nota} em 100` +
          (resultado.incompleta
            ? `, deixando ${porMarcar} pergunta(s) por marcar que valem ${
                resultado.pesoTotal - resultado.pesoRespondido
              } pontos que não lhe são atribuídos`
            : "") +
          (enviarEmail && podeEnviarEmail ? ", e enviar o email de agradecimento" : "") +
          "?"
      )
    )
      return;

    setAGravar(true);
    try {
      const r = await guardarAvaliacao({
        candidatoId,
        respostas,
        observacoes,
        recomendacao,
        enviarAgradecimento: enviarEmail && podeEnviarEmail,
      });

      if (!r.ok) {
        toast.error(r.mensagem);
        return;
      }

      setGuardado({ nota: r.nota ?? 0, drive: r.driveUrl ?? null });
      // A entrevista acabou aqui. O relógio pára neste instante, sem esperar
      // pelo refresh, e o servidor carimba o mesmo fecho do lado dele.
      setFim(new Date().toISOString());
      r.avisos.length === 0 ? toast.success(r.mensagem) : toast.warning(r.mensagem);
      for (const a of r.avisos) toast.warning(a);
      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível guardar.");
    } finally {
      setAGravar(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-3 py-3 sm:px-4">
        <ClipboardCheck className="h-4 w-4 shrink-0 text-consulvolt-vermelho" />
        <h2 className="text-sm font-semibold">Entrevista</h2>
        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
          {versao}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <RelogioEntrevista
            inicio={inicio}
            fim={fim}
            terminada={entrevistaFechada || finalizada || Boolean(guardado)}
            duracaoMinutos={duracaoMinutos}
            aComecar={aComecar}
            comecar={comecar}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAReagendar((v) => !v)}
            title="Mudar a data, mesmo com a entrevista aberta"
          >
            <CalendarClock className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">Reagendar</span>
          </Button>

          <Button asChild variant="outline" size="sm">
            <a href={`/admin/candidato/${candidatoId}/ficha`} target="_blank" rel="noreferrer">
              <Printer className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">Ficha em branco</span>
            </a>
          </Button>

          {jaAvaliado.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <a
                href={`/admin/candidato/${candidatoId}/ficha?avaliacao=1`}
                target="_blank"
                rel="noreferrer"
              >
                <FileDown className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline">Descarregar ficha</span>
              </a>
            </Button>
          )}
        </div>
      </header>

      {/* ============================================ COMO SE ENTRA ======= */}
      {/* A primeira coisa que o recrutador precisa à hora da entrevista não é
          a primeira pergunta - é por onde entra. Por isso fica aqui em cima,
          antes de tudo, e não escondido numa ficha ao lado. */}
      {modalidade === "videochamada" && salaLink && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-sky-50 px-3 py-2.5 sm:px-4">
          <Video className="h-4 w-4 shrink-0 text-sky-700" aria-hidden />
          <span className="text-sm font-semibold text-sky-900">Videochamada</span>
          <Button asChild size="sm" className="bg-sky-600 hover:bg-sky-700">
            <a href={salaLink} target="_blank" rel="noopener noreferrer">
              Entrar na sala
            </a>
          </Button>
          <span className="min-w-0 break-all text-[11px] text-sky-800/80">{salaLink}</span>
        </div>
      )}

      {modalidade === "videochamada" && !salaLink && (
        <p className="border-b bg-amber-50 px-3 py-2.5 text-xs text-amber-900 sm:px-4">
          Este candidato vai por videochamada mas não tem sala criada. Remarca a entrevista com a
          geração de salas ligada, ou cola um link à mão na marcação.
        </p>
      )}

      {modalidade === "chamada" && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-3 py-2.5 sm:px-4">
          <Phone className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <span className="text-sm font-semibold text-amber-900">Chamada telefónica</span>
          <Button asChild size="sm" variant="outline">
            <a href={`tel:${telefone}`}>{telefone}</a>
          </Button>
          <span className="text-[11px] text-amber-900/80">
            Regista cada tentativa na ficha, acima.
          </span>
        </div>
      )}

      {modalidade === POR_ESCOLHER && (
        <p className="border-b bg-slate-100 px-3 py-2.5 text-xs text-slate-700 sm:px-4">
          Este candidato ainda não disse se prefere videochamada ou chamada. Regista a escolha dele
          na ficha, acima, antes de começar.
        </p>
      )}

      {/* ------------------------------------------------ FICHA DE PAPEL -- */}
      <LerFicha
        candidatoId={candidatoId}
        aplicar={(lidas) =>
          // Junta-se ao que já está marcado em vez de substituir: quem já
          // tinha marcado metade à mão não perde esse trabalho.
          setRespostas((antes) => ({ ...antes, ...lidas }))
        }
      />

      <CaixaReagendar
        aberta={aReagendar}
        fechar={() => setAReagendar(false)}
        valorInicial={quando ? isoParaInput(quando) : ""}
        duracaoInicial={duracaoMinutos}
        reagendar={reagendar}
        aCorrer={aGravarData}
      />

      {/* --------------------------------------------- AVALIAÇÕES ANTERIORES */}
      {jaAvaliado.length > 0 && (
        <div className="border-b bg-emerald-50 px-3 py-2.5 sm:px-4">
          <p className="flex flex-wrap items-center gap-2 text-xs text-emerald-900">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>
              Já entrevistado:{" "}
              {jaAvaliado.map((a, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  <strong>{a.nota}</strong> em {a.quando}
                  {a.avaliador ? ` por ${a.avaliador}` : ""} ({a.versao})
                </span>
              ))}
            </span>
            {fichaUrl && (
              <a
                href={fichaUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex items-center gap-1 font-medium underline"
              >
                <ExternalLink className="h-3 w-3" />
                ver no Drive
              </a>
            )}
          </p>
        </div>
      )}

      {/* ------------------------------------------------- O GRUPO -------- */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4",
          grupo === "indeterminado" ? "bg-amber-50" : "bg-white"
        )}
      >
        <Users2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span className="text-xs font-medium">
          {grupo === "indeterminado" ? (
            <span className="text-amber-900">Grupo por decidir</span>
          ) : (
            NOME_GRUPO[grupo]
          )}
        </span>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          {grupo === "indeterminado"
            ? "Só aparecem as perguntas comuns até escolheres."
            : experiencia.porque}
        </span>

        <div className="ml-auto flex shrink-0 gap-1">
          {(["com_experiencia", "sem_experiencia"] as const).map((g) => (
            <button
              key={g}
              type="button"
              disabled={aMudarGrupo || grupo === g}
              onClick={() => mudarGrupo(g)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-default",
                grupo === g
                  ? "border-transparent bg-slate-800 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              )}
            >
              {g === "com_experiencia" ? "Com experiência" : "Sem experiência"}
            </button>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------- A NOTA ------ */}
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-3 sm:px-4">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-3xl font-bold leading-none",
              resultado.respondidas === 0 ? "text-slate-300" : "text-consulvolt-preto"
            )}
          >
            {resultado.respondidas === 0 ? "-" : resultado.nota}
          </span>
          <span className="text-xs text-muted-foreground">em 100</span>
        </div>

        {resultado.respondidas > 0 && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", escalao.crachá)}>
            {escalao.rotulo}
          </span>
        )}

        <div className="ml-auto text-right text-[11px] text-muted-foreground">
          <p>
            {resultado.respondidas} de {doCandidato.length} perguntas marcadas
          </p>
          {/* Os pontos ainda por atribuir são a diferença entre o que a nota
              diz hoje e o máximo que ela ainda pode chegar. Sem isto, uma nota
              baixa a meio da entrevista lê-se como um mau candidato em vez de
              uma entrevista a meio. */}
          <p>
            <strong>{resultado.pesoTotal - resultado.pesoRespondido}</strong> pontos ainda por
            atribuir
          </p>
        </div>

        {/* Duas barras numa: a cheia são os pontos já ganhos, a clara é o
            que ainda está em jogo nas perguntas por marcar. */}
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={cn(
              "h-full transition-all",
              resultado.nota >= 70 ? "bg-emerald-500" : resultado.nota >= 40 ? "bg-amber-500" : "bg-rose-500"
            )}
            style={{ width: `${resultado.respondidas === 0 ? 0 : resultado.nota}%` }}
          />
          <div
            className="h-full bg-slate-300 transition-all"
            style={{
              width: `${
                resultado.pesoTotal > 0
                  ? ((resultado.pesoTotal - resultado.pesoRespondido) / resultado.pesoTotal) * 100
                  : 0
              }%`,
            }}
          />
        </div>
      </div>

      {/* --------------------------------------------------- AS PERGUNTAS -- */}
      <div className="divide-y">
        {blocos.map(([bloco, lista]) => (
          <div key={bloco}>
            <p className="bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:px-4">
              {NOME_BLOCO[bloco]} · {lista.reduce((s, p) => s + p.peso, 0)} pontos
            </p>

            <ul className="divide-y">
              {lista.map((p) => {
                const escolhida = respostas[p.codigo];
                return (
                  <li key={p.codigo} className="px-3 py-3 sm:px-4">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded border bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                        {p.codigo}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{p.peso} pts</span>
                      {escolhida && (
                        <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
                          +{p.peso * ESCALA[escolhida].fraccao}
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-medium">{p.pergunta}</p>

                    {p.procurar && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <strong>O que procurar:</strong> {p.procurar}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {MARCACOES.map((m) => {
                        const activa = escolhida === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => marcar(p.codigo, m)}
                            className={cn(
                              "flex-1 basis-[90px] rounded-md border px-2 py-2 text-xs font-semibold transition-colors",
                              activa
                                ? ESCALA[m].crachá + " border-transparent"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                            )}
                          >
                            {ESCALA[m].rotulo}
                            <span className="ml-1 font-normal opacity-70">
                              {p.peso * ESCALA[m].fraccao}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------- FECHAR ---- */}
      <div className="space-y-3 border-t bg-slate-50 p-3 sm:p-4">
        {resultado.incompleta && resultado.respondidas > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Faltam <strong>{porMarcar}</strong> pergunta(s), que valem{" "}
              <strong>{resultado.pesoTotal - resultado.pesoRespondido}</strong> pontos. Esses
              pontos não são atribuídos, por isso a nota fica abaixo do que este candidato podia
              ter. A entrevista fica marcada como incompleta: se ficar assim, está a ser
              comparado com quem respondeu a tudo.
            </span>
          </p>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Recomendação (não conta para a nota)</Label>
          <div className="flex flex-wrap gap-1.5">
            {RECOMENDACOES.map((r) => (
              <button
                key={r.chave}
                type="button"
                onClick={() => setRecomendacao(recomendacao === r.chave ? null : r.chave)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
                  recomendacao === r.chave
                    ? r.classe
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                )}
              >
                {r.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ent-obs" className="text-xs">
            Observações do entrevistador
          </Label>
          <Textarea
            id="ent-obs"
            rows={3}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="O que ficou por dizer nas marcações."
            className="bg-white text-sm"
          />
        </div>

        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={enviarEmail && podeEnviarEmail}
            disabled={!podeEnviarEmail}
            onChange={(e) => setEnviarEmail(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          <span className={cn(!podeEnviarEmail && "text-muted-foreground")}>
            Enviar o email de agradecimento ao candidato
            {!podeEnviarEmail && " (o teu papel não permite enviar emails)"}
          </span>
        </label>

        <Button
          className="w-full"
          disabled={aGravar || aFinalizar || resultado.respondidas === 0}
          onClick={gravar}
        >
          {aGravar ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          <span className="ml-2">
            {aGravar
              ? "A guardar"
              : resultado.respondidas === 0
                ? "Marca as perguntas primeiro"
                : `Guardar avaliação (${resultado.nota}/100)`}
          </span>
        </Button>

        {/* Fechar sem avaliação. Fica discreto por ser a saída de excepção,
            mas está SEMPRE disponível: é para os casos em que não houve
            entrevista nenhuma, e é isso que trava o relógio. */}
        {!finalizada && !guardado && (
          <Button
            variant="outline"
            className="w-full border-amber-300 text-amber-800 hover:bg-amber-50"
            disabled={aGravar || aFinalizar}
            onClick={finalizar}
          >
            {aFinalizar ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleSlash className="h-4 w-4" />}
            <span className="ml-2">
              {aFinalizar ? "A finalizar" : "Finalizar entrevista sem avaliação"}
            </span>
          </Button>
        )}

        {finalizada && (
          <p className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            <CircleSlash className="h-3.5 w-3.5 shrink-0" />
            Entrevista finalizada sem avaliação. O motivo ficou no histórico do candidato.
          </p>
        )}

        {guardado && (
          <p className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Guardado com <strong>{guardado.nota}</strong> em 100.
            {guardado.drive && (
              <a href={guardado.drive} target="_blank" rel="noreferrer" className="font-medium underline">
                Ver a ficha no Drive
              </a>
            )}
          </p>
        )}

        <p className="text-[11px] leading-snug text-muted-foreground">
          A nota da entrevista é <strong>ordenação sugerida</strong>, não é aprovação nem
          rejeição. A ficha fica guardada na pasta do candidato no Google Drive.
        </p>
      </div>
    </section>
  );
}
