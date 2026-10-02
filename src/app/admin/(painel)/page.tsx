import Link from "next/link";
import { AlertTriangle, ExternalLink, FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CartoesResumo } from "@/components/cartoes-resumo";
import { FiltrosCandidatos } from "@/components/filtros-candidatos";
import { TabelaCandidatos } from "@/components/tabela-candidatos";
import { Paginacao } from "@/components/paginacao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { podeNaSessao } from "@/lib/utilizadores";
import { lerConfiguracaoFunil } from "@/lib/funil/carregar";
import { fatiar, lerPaginacao } from "@/lib/paginacao";
import { dataCurta, fimDoDia, inicioDoDia } from "@/lib/datas";
import { EMPRESA } from "@/lib/constantes";
import type { Candidato } from "@/types/database";

/** O painel mostra sempre dados frescos. */
export const dynamic = "force-dynamic";

interface Props {
  searchParams: {
    provincia?: string;
    municipio?: string;
    status?: string;
    carta?: string;
    mtbt?: string;
    experiencia?: string;
    q?: string;
    de?: string;
    ate?: string;
    pagina?: string;
    porPagina?: string;
    semPermissao?: string;
  };
}

/** Converte "sim"/"nao" do endereço num booleano; devolve null se não houver filtro. */
function booleanoDoFiltro(valor?: string): boolean | null {
  if (valor === "sim") return true;
  if (valor === "nao") return false;
  return null;
}

import { obterConcursoActivo } from "@/app/admin/accoes-concursos";

export default async function PainelAdmin({ searchParams }: Props) {
  const supabase = criarClienteServidor();
  const [podeExportar, podeEditar, config, concursoActivo] = await Promise.all([
    podeNaSessao("exportar"),
    podeNaSessao("editar_candidatura"),
    lerConfiguracaoFunil(),
    obterConcursoActivo(),
  ]);

  // Os estados que o painel oferece para MUDAR são os configurados.
  const nomesDosEstados = config.estados.filter((e) => e.activo).map((e) => e.nome);

  // Os que oferece para FILTRAR são esses mais os nomes antigos.
  const estadosParaFiltrar = Array.from(
    new Set([...nomesDosEstados, ...config.estados.flatMap((e) => e.aliases)])
  );

  // ------------------------------------------------------------ CONSULTA
  let consulta = supabase.from("candidatos").select("*").order("created_at", { ascending: false });

  if (concursoActivo?.id) {
    consulta = consulta.eq("concurso_id", concursoActivo.id);
  }

  if (searchParams.provincia) consulta = consulta.eq("provincia", searchParams.provincia);
  if (searchParams.municipio) consulta = consulta.eq("municipio", searchParams.municipio);
  if (searchParams.status) consulta = consulta.eq("status", searchParams.status);

  const carta = booleanoDoFiltro(searchParams.carta);
  if (carta !== null) consulta = consulta.eq("tem_carta", carta);

  const mtbt = booleanoDoFiltro(searchParams.mtbt);
  if (mtbt !== null) consulta = consulta.eq("conhece_mtbt", mtbt);

  const experiencia = booleanoDoFiltro(searchParams.experiencia);
  if (experiencia !== null) consulta = consulta.eq("experiencia_similar", experiencia);

  // Intervalo de datas de submissão. Os limites são interpretados em hora de
  // Angola, senão "1 a 10 de Setembro" perderia as candidaturas feitas entre
  // as 23h e a meia-noite, que em UTC já pertencem ao dia seguinte.
  const de = searchParams.de ? inicioDoDia(searchParams.de) : null;
  const ate = searchParams.ate ? fimDoDia(searchParams.ate) : null;

  if (de) consulta = consulta.gte("created_at", de);
  if (ate) consulta = consulta.lte("created_at", ate);

  if (searchParams.q) {
    // Escapamos vírgulas e parênteses, que têm significado especial no .or()
    const termo = searchParams.q.replace(/[,()]/g, " ").trim();
    if (termo) {
      consulta = consulta.or(
        `nome.ilike.%${termo}%,bi.ilike.%${termo}%,email.ilike.%${termo}%,telefone.ilike.%${termo}%`
      );
    }
  }

  const { data, error } = await consulta.limit(1000);

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
        <div>
          <p className="font-semibold text-rose-800">Não foi possível ler as candidaturas</p>
          <p className="mt-1 text-sm text-rose-700">{error.message}</p>
          <p className="mt-2 text-xs text-rose-600">
            Confirma a variável SUPABASE_SERVICE_ROLE_KEY e se o schema.sql já foi corrido.
          </p>
        </div>
      </div>
    );
  }

  const candidatos = (data ?? []) as Candidato[];

  const resumo = {
    total: candidatos.length,
    pendentes: candidatos.filter((c) => c.status === "Pendente").length,
    aprovados: candidatos.filter((c) => c.status === "Aprovado").length,
    contactados: candidatos.filter((c) => c.status === "Contactado").length,
    comCarta: candidatos.filter((c) => c.tem_carta).length,
    comMtbt: candidatos.filter((c) => c.conhece_mtbt).length,
    comExperiencia: candidatos.filter((c) => c.experiencia_similar).length,
  };

  const porArquivar = candidatos.filter((c) => c.arquivamento_estado === "erro").length;

  // A exportação leva os mesmos FILTROS da vista, mas nunca a paginação: o
  // Excel tem de trazer tudo o que corresponde à pesquisa, não só a página
  // que está no ecrã.
  const { pagina: _p, porPagina: _pp, semPermissao: _sp, ...filtros } = searchParams;
  const temIntervalo = Boolean(de || ate);
  const parametros = new URLSearchParams(
    Object.entries(filtros).filter(([, v]) => Boolean(v)) as [string, string][]
  );

  if (concursoActivo?.id) {
    parametros.set("concurso_id", concursoActivo.id);
  }

  // Os cartões de resumo contam o conjunto filtrado inteiro; a tabela mostra
  // só a página pedida.
  const fatia = lerPaginacao(searchParams, candidatos.length);
  const daPagina = fatiar(candidatos, fatia);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Candidaturas</h1>
          <p className="text-sm text-muted-foreground">
            {concursoActivo?.nome || "Concurso Geral"} • {concursoActivo?.vagaTitulo || "Recrutamento"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href={concursoActivo?.slug ? `/app?c=${concursoActivo.slug}` : "/app"} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              <span className="hidden xs:inline">Ver formulário público</span>
              <span className="xs:hidden">Formulário</span>
            </Link>
          </Button>

          {podeExportar && (
            <Button asChild>
              <a href={`/api/admin/exportar?${parametros.toString()}`}>
                <FileSpreadsheet className="h-4 w-4" />
                <span className="hidden xs:inline">Exportar para Excel</span>
                <span className="xs:hidden">Excel</span>
              </a>
            </Button>
          )}
        </div>
      </div>

      {searchParams.semPermissao && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            Essa página é só para administradores. Se precisares de lá entrar, pede a um
            administrador que te mude o papel.
          </p>
        </div>
      )}

      <CartoesResumo resumo={resumo} />

      {porArquivar > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            <strong>{porArquivar}</strong> candidatura(s) não chegaram ao Google Drive. Abre os
            detalhes e usa o botão <em>Repetir arquivamento</em>. Os documentos estão guardados em
            segurança no Supabase.
          </p>
        </div>
      )}

      <FiltrosCandidatos estados={estadosParaFiltrar} />

      {temIntervalo && (
        <p className="text-sm text-muted-foreground">
          A mostrar candidaturas submetidas{" "}
          {de && ate ? (
            <>
              entre <strong className="text-foreground">{dataCurta(de)}</strong> e{" "}
              <strong className="text-foreground">{dataCurta(ate)}</strong>
            </>
          ) : de ? (
            <>
              a partir de <strong className="text-foreground">{dataCurta(de)}</strong>
            </>
          ) : (
            <>
              até <strong className="text-foreground">{dataCurta(ate!)}</strong>
            </>
          )}
          .
        </p>
      )}

      {resumo.total === 1000 && (
        <p className="text-sm text-muted-foreground">
          A lista está limitada às 1000 candidaturas mais recentes.
        </p>
      )}

      <div className="space-y-3">
        <TabelaCandidatos candidatos={daPagina} podeEditar={podeEditar} estados={nomesDosEstados} />
        <Paginacao fatia={fatia} nome="candidatura" />
      </div>
    </div>
  );
}
