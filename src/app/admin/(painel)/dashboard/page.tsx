import { AlertCircle, BarChart3, Database } from "lucide-react";

import { Funil } from "@/components/dashboard/funil";
import { CartaoGrafico } from "@/components/dashboard/grafico";
import { ConstrutorGraficos } from "@/components/dashboard/construtor-graficos";
import { BotaoLerBis } from "@/components/dashboard/botao-ler-bis";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { carregarAnalises } from "@/lib/ranking/carregar";
import { lerConfiguracaoFunil } from "@/lib/funil/carregar";
import { lerDefinicoes } from "@/lib/definicoes";
import { calcularFunil, chaveDoEstado } from "@/lib/funil/calcular";
import { agregar, type LinhaDashboard } from "@/lib/dashboard/campos";
import { podeNaSessao } from "@/lib/utilizadores";
import type { Candidato } from "@/types/database";

export const dynamic = "force-dynamic";

/**
 * ===========================================================================
 * DASHBOARD
 * ---------------------------------------------------------------------------
 * A página para quem vai decidir sobre contratações. Responde a três
 * perguntas, por esta ordem, que é a ordem em que elas se fazem:
 *
 *  1. Chegamos ao número?     - o funil, com o previsto ao lado do real
 *  2. Onde é que travámos?    - o degrau onde se perde mais gente
 *  3. Quem é esta gente?      - os gráficos, e os que mais se quiserem
 *
 * TUDO O QUE APARECE AQUI É AGREGADO. Não há um único nome nesta página. Sexo
 * e idade só existem somados; para ver a ficha de alguém vai-se às
 * Candidaturas, onde há registo de quem abriu o quê.
 *
 * Uma leitura à base de dados serve a página inteira: os gráficos são funções
 * puras sobre a mesma lista. Acrescentar um décimo gráfico não custa uma
 * consulta a mais.
 * ===========================================================================
 */

import { obterConcursoActivo } from "@/app/admin/accoes-concursos";

export default async function Dashboard() {
  const supabase = criarClienteServidor();
  const concursoActivo = await obterConcursoActivo();

  let consultaCandidatos = supabase
    .from("candidatos")
    .select(
      "id, created_at, status, provincia, municipio, nivel_academico, curso, experiencia_similar, tem_carta, conhece_mtbt, sexo, data_nascimento"
    )
    .order("created_at", { ascending: true })
    .limit(5000);

  if (concursoActivo?.id) {
    consultaCandidatos = consultaCandidatos.eq("concurso_id", concursoActivo.id);
  }

  const [{ data: candidatosData, error }, analises, config, definicoes, podeConfigurar, podeAnalisar] =
    await Promise.all([
      consultaCandidatos,
      carregarAnalises(),
      lerConfiguracaoFunil(),
      lerDefinicoes(concursoActivo?.slug),
      podeNaSessao("configurar"),
      podeNaSessao("analisar"),
    ]);

  // As colunas do BI podem ainda não existir. Em vez de falhar a página
  // inteira, lê-se sem elas e avisa-se - o funil e os outros gráficos não
  // dependem do sexo nem da idade.
  const faltamColunas = Boolean(error) && (error as { code?: string })?.code === "42703";

  let candidatos: Partial<Candidato>[] = (candidatosData ?? []) as Partial<Candidato>[];

  if (faltamColunas) {
    const r = await supabase
      .from("candidatos")
      .select(
        "id, created_at, status, provincia, municipio, nivel_academico, curso, experiencia_similar, tem_carta, conhece_mtbt"
      )
      .order("created_at", { ascending: true })
      .limit(5000);
    candidatos = (r.data ?? []) as Partial<Candidato>[];
  }

  // As notas das entrevistas, para os gráficos que as usam. Uma falha aqui
  // não pode derrubar a página: o módulo pode ainda não estar migrado.
  const notas = new Map<string, number>();
  const recrutadores = new Map<string, string>();
  try {
    const { carregarEntrevistas } = await import("@/lib/entrevista/atribuicoes");
    const carga = await carregarEntrevistas();
    for (const l of carga.linhas) {
      if (typeof l.nota === "number") notas.set(l.candidatoId, l.nota);
      if (l.recrutador) recrutadores.set(l.candidatoId, l.recrutador);
    }
  } catch {
    // Sem entrevistas ainda. Os gráficos dessas colunas mostram «Não indicado».
  }

  const linhas: LinhaDashboard[] = candidatos.map((c) => ({
    id: c.id!,
    criadoEm: c.created_at ?? "",
    // O funil e os gráficos falam sempre o vocabulário em vigor, mesmo quando
    // a base de dados ainda tem o antigo gravado.
    estado: chaveDoEstado(c.status ?? null, config.estados) ?? c.status ?? null,
    provincia: c.provincia ?? null,
    municipio: c.municipio ?? null,
    nivelAcademico: c.nivel_academico ?? null,
    curso: c.curso ?? null,
    experienciaSimilar: c.experiencia_similar ?? null,
    temCarta: c.tem_carta ?? null,
    conheceMtBt: c.conhece_mtbt ?? null,
    sexo: (c as { sexo?: string | null }).sexo ?? null,
    nascimento: (c as { data_nascimento?: string | null }).data_nascimento ?? null,
    pontuacao: analises.porCandidato.get(c.id!)?.pontuacao_total ?? null,
    notaEntrevista: notas.get(c.id!) ?? null,
    recrutador: recrutadores.get(c.id!) ?? null,
  }));

  const alvo = definicoes.vagasPrevistas;
  // `chaveDoEstado` já correu em cima: passar a chave outra vez é inofensivo,
  // porque uma chave traduz-se para si mesma.
  const funil = calcularFunil(
    linhas.map((l) => ({ status: l.estado })),
    config.niveis,
    config.estados,
    alvo
  );
  const agora = new Date();

  const comSexo = linhas.filter((l) => l.sexo).length;
  const comIdade = linhas.filter((l) => l.nascimento).length;
  const contratados = funil[funil.length - 1]?.tem ?? 0;

  const indicadores = [
    { rotulo: "Candidaturas", valor: String(linhas.length), nota: "recebidas até agora" },
    { rotulo: "Alvo de contratações", valor: String(alvo), nota: "definido em Definições" },
    {
      rotulo: "Já contratados",
      valor: String(contratados),
      nota: alvo > 0 ? `${Math.round((contratados / alvo) * 100)}% do alvo` : "sem alvo definido",
    },
    {
      rotulo: "Dados do BI lidos",
      valor: `${comSexo}/${linhas.length}`,
      nota: `${comIdade} com data de nascimento`,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <BarChart3 className="h-5 w-5 text-consulvolt-vermelho" aria-hidden />
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            {concursoActivo?.nome || "Concurso Geral"} • Indicadores e métricas analíticas em tempo real.
          </p>
        </div>

        {podeAnalisar && <BotaoLerBis />}
      </div>

      {(faltamColunas || config.porMigrar) && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            A migração <strong>20260922c_dashboard_e_funil.sql</strong> ainda não correu no Supabase.
            O funil está a usar os valores de origem e os gráficos de sexo e idade ficam vazios. Todo
            o resto funciona.
          </span>
        </p>
      )}

      {linhas.length === 0 && !faltamColunas && (
        <p className="flex items-start gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Ainda não há candidaturas. Os gráficos aparecem assim que a primeira entrar.
        </p>
      )}

      {/* ------------------------------------------------------ INDICADORES */}
      {/* Uma tira só, com os cartões estreitos lado a lado. No telemóvel
          desliza na horizontal em vez de empilhar: quatro cartões empilhados
          empurravam a pirâmide para fora do primeiro ecrã, e a pirâmide é o
          que se vem cá ver. */}
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0">
        {indicadores.map((i) => (
          <div
            key={i.rotulo}
            className="min-w-[8.5rem] flex-1 shrink-0 snap-start rounded-lg border bg-white px-3 py-2"
          >
            <p className="truncate text-[11px] font-medium text-muted-foreground" title={i.rotulo}>
              {i.rotulo}
            </p>
            <p className="text-xl font-bold leading-tight tabular-nums text-slate-900">{i.valor}</p>
            <p className="truncate text-[11px] text-muted-foreground" title={i.nota}>
              {i.nota}
            </p>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------ FUNIL */}
      <Funil linhas={funil} alvo={alvo} />

      {/* --------------------------------------------------------- GRÁFICOS */}
      {/* items-start: sem ele, um cartão baixo estica-se até à altura do vizinho
          alto e fica com meio palmo de branco por baixo. */}
      {config.graficos.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {config.graficos.map((g) => (
            <CartaoGrafico key={g.id} grafico={g} agregado={agregar(linhas, g, agora)} />
          ))}
        </div>
      )}

      <ConstrutorGraficos iniciais={config.graficos} podeGuardar={podeConfigurar} />

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-muted-foreground">
        O sexo e a data de nascimento são lidos do Bilhete de Identidade que o candidato carregou, e
        servem só para estas contagens. <strong>Não entram na pontuação nem no ranking</strong> - a
        ordenação dos candidatos continua a sair apenas do que diz respeito à capacidade de fazer o
        trabalho.
      </p>
    </div>
  );
}
