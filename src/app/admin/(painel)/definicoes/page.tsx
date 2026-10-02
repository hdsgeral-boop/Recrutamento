import { AlertCircle, SlidersHorizontal } from "lucide-react";

import { PainelDefinicoes } from "@/components/painel-definicoes";
import { EditorRoteiro } from "@/components/editor-roteiro";
import { EditorFunil } from "@/components/editor-funil";
import { TesteCalendar } from "@/components/teste-calendar";
import { EditorEstados } from "@/components/editor-estados";
import { lerRoteiroEmVigor } from "@/lib/entrevista/carregar-roteiro";
import { lerConfiguracaoFunil } from "@/lib/funil/carregar";
import { lerDefinicoes, aceitaCandidaturas, motivoDoFecho } from "@/lib/definicoes";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { podeNaSessao } from "@/lib/utilizadores";
import { dataHora } from "@/lib/datas";

export const dynamic = "force-dynamic";

/**
 * Definições do recrutamento: prazo, vagas previstas e abertura do formulário.
 * A página só existe para quem tem a capacidade "configurar"; o middleware já
 * barra a entrada, e aqui confirma-se outra vez.
 */
import { obterConcursoActivo } from "@/app/admin/accoes-concursos";

export default async function Definicoes() {
  const concursoActivo = await obterConcursoActivo();
  const [autorizado, definicoes, roteiro, config, contagens] = await Promise.all([
    podeNaSessao("configurar"),
    lerDefinicoes(concursoActivo?.slug),
    lerRoteiroEmVigor(),
    lerConfiguracaoFunil(),
    contarPorValorGravado(),
  ]);

  if (!autorizado) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold text-amber-900">Sem permissão</p>
          <p className="mt-1 text-sm text-amber-800">
            Só um administrador ou gestor pode mudar o prazo e as vagas. Fala com quem administra o
            painel.
          </p>
        </div>
      </div>
    );
  }

  const aberto = aceitaCandidaturas(definicoes);
  const motivo = motivoDoFecho(definicoes);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <SlidersHorizontal className="h-5 w-5 text-consulvolt-vermelho" />
            Definições
          </h1>
          <p className="text-sm text-muted-foreground">
            O que aqui se muda entra em vigor de imediato, sem novo deploy.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
            aberto
              ? "bg-emerald-50 text-emerald-800 ring-emerald-300"
              : "bg-rose-50 text-rose-800 ring-rose-300"
          }`}
        >
          {aberto
            ? "Formulário a receber candidaturas"
            : motivo === "prazo"
              ? "Fechado: o prazo terminou"
              : "Fechado manualmente"}
        </span>
      </div>

      <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-muted-foreground">
        Prazo actual: <strong className="text-slate-900">{dataHora(definicoes.prazo)}</strong> (hora
        de Angola).
      </p>

      <PainelDefinicoes iniciais={definicoes} />

      {/* ------------------------------------------------ ROTEIRO --------- */}
      {/* Submódulo das Definições: o que se pergunta na entrevista e quanto
          vale cada pergunta. Muda-se aqui, sem deploy. */}
      {/* ------------------------------------------------ FUNIL ----------- */}
      {/* As fases do recrutamento e os estados por que cada candidato passa.
          Mudam-se aqui e entram em vigor no Dashboard e no painel, sem deploy. */}
      <TesteCalendar />

      <EditorFunil
        iniciais={config.niveis}
        estados={config.estados}
        alvo={definicoes.vagasPrevistas}
        daBaseDeDados={config.daBaseDeDados}
        porMigrar={config.porMigrar}
      />

      <EditorEstados
        iniciais={config.estados}
        contagens={contagens}
        daBaseDeDados={config.daBaseDeDados}
        porMigrar={config.porMigrar}
      />

      <EditorRoteiro
        versao={roteiro.versao}
        iniciais={roteiro.perguntas}
        daBaseDeDados={roteiro.daBaseDeDados}
        porMigrar={roteiro.porMigrar}
        avisos={roteiro.avisos}
        criadoEm={roteiro.criadoEm}
        criadoPor={roteiro.criadoPor}
      />
    </div>
  );
}

/**
 * Quantas candidaturas há por CADA VALOR TAL COMO ESTÁ GRAVADO em
 * `candidatos.status` - sem tradução nenhuma. É de propósito: o editor precisa
 * de mostrar quantas pessoas ficam de fora se alguém tirar um nome antigo da
 * lista, e para isso tem de ver os valores crus.
 */
async function contarPorValorGravado(): Promise<Record<string, number>> {
  try {
    const supabase = criarClienteServidor();
    const { data } = await supabase.from("candidatos").select("status").limit(5000);
    const contagens: Record<string, number> = {};
    for (const l of (data ?? []) as { status: string | null }[]) {
      if (!l.status) continue;
      contagens[l.status] = (contagens[l.status] ?? 0) + 1;
    }
    return contagens;
  } catch {
    return {};
  }
}
