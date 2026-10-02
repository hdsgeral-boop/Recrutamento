import type { Metadata } from "next";
import { headers } from "next/headers";
import { CalendarClock } from "lucide-react";
import { CabecalhoPublico } from "@/components/cabecalho-publico";
import { FormularioCandidatura } from "@/components/formulario-candidatura";
import { Card, CardContent } from "@/components/ui/card";
import { EMPRESA } from "@/lib/constantes";
import { aceitaCandidaturas, lerDefinicoes, motivoDoFecho } from "@/lib/definicoes";
import { dataHora } from "@/lib/datas";
import { concursoDosCabecalhos, SLUG_PADRAO } from "@/lib/concurso-contexto";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { obterCamposFormulario } from "@/lib/formulario/campos";

export const metadata: Metadata = {
  title: "Candidatura | Consulvolt",
  description: "Formulário de candidatura para processos selectivos e vagas da Consulvolt.",
};

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: {
    c?: string;
  };
}

export default async function PaginaCandidatura({ searchParams }: Props) {
  const listaCabecalhos = headers();
  const { slug } = concursoDosCabecalhos(listaCabecalhos);
  const slugFinal = searchParams?.c || slug || SLUG_PADRAO;

  const supabase = criarClienteServidor();

  // Procurar o concurso activo na base de dados
  let { data: concurso } = await supabase
    .from("concursos")
    .select("*")
    .eq("slug", slugFinal)
    .maybeSingle();

  // Se não encontrar pelo slug, buscar o primeiro concurso aberto
  if (!concurso) {
    const { data: primeiro } = await supabase
      .from("concursos")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    concurso = primeiro;
  }

  const definicoes = await lerDefinicoes(concurso?.slug || slugFinal);
  const aberto = aceitaCandidaturas(definicoes);
  const motivo = motivoDoFecho(definicoes);

  const vagaTitulo = concurso?.vaga_titulo || "Processo Selectivo";
  const vagaDescricao = concurso?.vaga_descricao || null;
  const concursoId = concurso?.id || "geral";

  const camposDinamicos = await obterCamposFormulario(concursoId);

  return (
    <>
      <CabecalhoPublico prazo={definicoes.prazo} />

      <main className="container max-w-3xl py-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-consulvolt-vermelho">
            {aberto ? "Recrutamento aberto" : "Candidaturas encerradas"}
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{vagaTitulo}</h1>
          {vagaDescricao && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {vagaDescricao}
            </p>
          )}
        </div>

        {aberto ? (
          <Card>
            <CardContent className="p-5 sm:p-7">
              <FormularioCandidatura
                concursoSlug={concurso?.slug || slugFinal}
                vagaTitulo={vagaTitulo}
                vagaDescricao={vagaDescricao}
                camposDinamicos={camposDinamicos}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-3 p-5 sm:p-7">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-consulvolt-vermelho" />
                <div className="min-w-0">
                  <h2 className="font-semibold">Já não estamos a receber candidaturas</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {definicoes.mensagemEncerrado?.trim() ||
                      (motivo === "prazo"
                        ? `O prazo terminou a ${dataHora(definicoes.prazo)}. Estamos a analisar as candidaturas recebidas e vamos contactar quem avançar.`
                        : "As candidaturas estão fechadas de momento. Se voltarmos a abrir, anunciaremos pelos canais oficiais.")}
                  </p>
                </div>
              </div>

              <p className="rounded-lg bg-slate-50 p-3 text-xs text-muted-foreground">
                Se já submeteste a tua candidatura, não precisas de fazer nada: os teus dados foram
                registados com segurança e informaremos o resultado.
              </p>
            </CardContent>
          </Card>
        )}

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          {EMPRESA.nomeCompleto} - {EMPRESA.morada}
        </footer>
      </main>
    </>
  );
}
