"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { sessaoActual } from "@/lib/utilizadores";
import { pode } from "@/lib/permissoes";
import {
  COOKIE_CONCURSO_ACTIVO,
  SLUG_PADRAO,
  CABECALHO_CONCURSO_SLUG,
} from "@/lib/concurso-contexto";
import {
  validarDadosConcurso,
  type NovoConcursoInput,
} from "@/lib/concurso/validar";
import type { Concurso } from "@/types/concurso";

export interface RespostaAccaoConcurso {
  ok: boolean;
  mensagem?: string;
  slug?: string;
}

export interface ConcursoComContagens extends Concurso {
  totalCandidatos: number;
}

/**
 * Lê o slug do concurso activo actualmente na sessão do painel de administração.
 */
export async function obterConcursoActivoSlug(): Promise<string> {
  const cookieStore = cookies();
  const doCookie = cookieStore.get(COOKIE_CONCURSO_ACTIVO)?.value;
  if (doCookie) return doCookie;

  const cabecalhos = headers();
  const doHeader = cabecalhos.get(CABECALHO_CONCURSO_SLUG);
  if (doHeader) return doHeader;

  return SLUG_PADRAO;
}

/**
 * Define o concurso activo gravando o cookie na sessão do administrador.
 */
export async function definirConcursoActivo(slug: string): Promise<RespostaAccaoConcurso> {
  try {
    const limpo = slug.trim().toLowerCase();
    const cookieStore = cookies();
    cookieStore.set(COOKIE_CONCURSO_ACTIVO, limpo, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 dias
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });

    revalidatePath("/admin", "layout");
    return { ok: true, slug: limpo };
  } catch (erro) {
    return {
      ok: false,
      mensagem: erro instanceof Error ? erro.message : "Erro ao alterar concurso activo.",
    };
  }
}

/**
 * Carrega os dados completos do concurso activo actualmente na sessão.
 */
export async function obterConcursoActivo(): Promise<Concurso | null> {
  try {
    const slug = await obterConcursoActivoSlug();
    const supabase = criarClienteServidor();

    // 1. Tentar carregar concurso pelo slug activo
    let { data: c } = await supabase
      .from("concursos")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    // 2. Se não encontrou por slug, carregar o primeiro disponível
    if (!c) {
      const { data: primeiro } = await supabase
        .from("concursos")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      c = primeiro;
    }

    if (!c) return null;

    return {
      id: c.id,
      organizacaoId: c.organizacao_id,
      slug: c.slug,
      dominio: c.dominio,
      nome: c.nome,
      vagaTitulo: c.vaga_titulo,
      vagaDescricao: c.vaga_descricao,
      estado: c.estado,
      prazoCandidaturas: c.prazo_candidaturas,
      vagasPrevistas: c.vagas_previstas,
      candidaturasAbertas: c.candidaturas_abertas ?? true,
      mensagemEncerrado: c.mensagem_encerrado,
      rubricaVersao: c.rubrica_versao,
      roteiroId: c.roteiro_id,
      janelaAbertura: c.janela_abertura,
      janelaFecho: c.janela_fecho,
      duracaoEntrevistaMin: c.duracao_entrevista_min,
      descansoMin: c.descanso_min,
      modalidadePadrao: c.modalidade_padrao,
      remetenteNome: c.remetente_nome,
      remetenteEmail: c.remetente_email,
      enderecoResposta: c.endereco_resposta ?? null,
      pastaDriveId: c.pasta_drive_id ?? null,
      pastaDriveNome: c.pasta_drive_nome ?? null,
      criadoEm: c.criado_em,
    };
  } catch (erro) {
    console.error("[concursos] erro ao obter concurso activo:", erro);
    return null;
  }
}

/**
 * Lista todos os concursos registados no sistema com as suas contagens.
 */
export async function listarConcursosParaAdmin(): Promise<ConcursoComContagens[]> {
  try {
    const supabase = criarClienteServidor();

    const { data: concursos, error } = await supabase
      .from("concursos")
      .select("*, candidatos(count)")
      .order("criado_em", { ascending: false });

    if (error || !concursos) {
      console.warn("[concursos] erro ao listar:", error?.message);
      return [];
    }

    return concursos.map((c) => {
      const contagem = Array.isArray(c.candidatos) && c.candidatos.length > 0
        ? (c.candidatos[0] as { count: number }).count
        : 0;

      return {
        id: c.id,
        organizacaoId: c.organizacao_id,
        slug: c.slug,
        dominio: c.dominio,
        nome: c.nome,
        vagaTitulo: c.vaga_titulo,
        vagaDescricao: c.vaga_descricao,
        estado: c.estado,
        prazoCandidaturas: c.prazo_candidaturas,
        vagasPrevistas: c.vagas_previstas,
        candidaturasAbertas: c.candidaturas_abertas ?? true,
        mensagemEncerrado: c.mensagem_encerrado,
        rubricaVersao: c.rubrica_versao,
        rubricaConfig: c.rubrica_config ?? null,
        roteiroId: c.roteiro_id,
        roteiroConfig: c.roteiro_config ?? null,
        janelaAbertura: c.janela_abertura,
        janelaFecho: c.janela_fecho,
        duracaoEntrevistaMin: c.duracao_entrevista_min,
        descansoMin: c.descanso_min,
        modalidadePadrao: c.modalidade_padrao,
        remetenteNome: c.remetente_nome,
        remetenteEmail: c.remetente_email,
        enderecoResposta: c.endereco_resposta ?? null,
        pastaDriveId: c.pasta_drive_id ?? null,
        pastaDriveNome: c.pasta_drive_nome ?? null,
        criadoEm: c.criado_em,
        totalCandidatos: contagem,
      };
    });
  } catch (erro) {
    console.error("[concursos] erro inesperado ao carregar:", erro);
    return [];
  }
}

/**
 * Cria um novo concurso no sistema com integridade referencial.
 */
export async function criarNovoConcurso(input: NovoConcursoInput): Promise<RespostaAccaoConcurso> {
  const sessao = await sessaoActual();
  if (!sessao || !pode(sessao.papel, "configurar")) {
    return { ok: false, mensagem: "Não tens permissão para criar concursos." };
  }

  const validacao = validarDadosConcurso(input);
  if (!validacao.valido || !validacao.dados) {
    const primeiroErro = Object.values(validacao.erros || {})[0];
    return { ok: false, mensagem: primeiroErro || "Dados do concurso inválidos." };
  }

  const d = validacao.dados;
  const supabase = criarClienteServidor();

  // Verificar se o slug já existe
  const { data: existente } = await supabase
    .from("concursos")
    .select("id")
    .eq("slug", d.slug)
    .maybeSingle();

  if (existente) {
    return { ok: false, mensagem: `O identificador "${d.slug}" já está em uso por outro concurso.` };
  }

  // Obter id da organização principal (Consulvolt)
  let organizacaoId: string | null = null;
  const { data: org } = await supabase
    .from("organizacoes")
    .select("id")
    .order("criada_em", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (org) {
    organizacaoId = org.id;
  } else {
    const { data: novaOrg } = await supabase
      .from("organizacoes")
      .insert({ nome: "Consulvolt Engenharia e Serviços", cor_principal: "#CE1B2E" })
      .select("id")
      .single();
    organizacaoId = novaOrg?.id || null;
  }

  if (!organizacaoId) {
    return { ok: false, mensagem: "Não foi possível associar a organização ao concurso." };
  }

  const versaoRoteiro = `roteiro-${d.slug}`;

  const { data: concCriado, error: erroInsert } = await supabase
    .from("concursos")
    .insert({
      organizacao_id: organizacaoId,
      slug: d.slug,
      nome: d.nome,
      vaga_titulo: d.vagaTitulo,
      vaga_descricao: d.vagaDescricao,
      vagas_previstas: d.vagasPrevistas,
      prazo_candidaturas: d.prazoCandidaturas,
      rubrica_versao: d.rubricaVersao || "padrao-v1",
      rubrica_config: d.rubricaConfig || null,
      roteiro_id: versaoRoteiro,
      roteiro_config: d.roteiroConfig || null,
      modalidade_padrao: d.modalidadePadrao || "videochamada",
      estado: "aberto",
      candidaturas_abertas: true,
    })
    .select("id")
    .single();

  if (erroInsert || !concCriado) {
    console.error("[concursos] erro ao criar concurso:", erroInsert);
    return { ok: false, mensagem: `Erro ao gravar concurso: ${erroInsert?.message}` };
  }

  // Se foram configuradas perguntas de entrevista personalizadas, guardar na tabela roteiros_entrevista
  const perguntasRoteiro = (d.roteiroConfig as { perguntas?: unknown[] } | undefined)?.perguntas;
  if (Array.isArray(perguntasRoteiro) && perguntasRoteiro.length > 0) {
    await supabase.from("roteiros_entrevista").upsert({
      versao: versaoRoteiro,
      concurso_id: concCriado.id,
      perguntas: perguntasRoteiro,
      activo: true,
      notas: `Roteiro específico configurado na Etapa 2 do concurso "${d.nome}"`,
    });
  }

  // Activar automaticamente o novo concurso na sessão do administrador
  await definirConcursoActivo(d.slug);

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/concursos");

  return { ok: true, slug: d.slug };
}

/**
 * Guarda ou actualiza a rúbrica e o roteiro de entrevista de um concurso existente.
 */
export async function guardarRubricaERoteiroConcurso({
  concursoId,
  rubricaConfig,
  roteiroConfig,
  modalidadePadrao,
}: {
  concursoId: string;
  rubricaConfig: unknown;
  roteiroConfig: unknown;
  modalidadePadrao?: "chamada" | "videochamada" | "presencial";
}): Promise<{ ok: boolean; mensagem?: string }> {
  try {
    const sessao = await sessaoActual();
    if (!sessao || !pode(sessao.papel, "configurar")) {
      return { ok: false, mensagem: "Sem permissão para alterar configurações do concurso." };
    }

    const supabase = criarClienteServidor();

    const dadosUpdate: Record<string, unknown> = {
      rubrica_config: rubricaConfig,
      roteiro_config: roteiroConfig,
    };
    if (modalidadePadrao) {
      dadosUpdate.modalidade_padrao = modalidadePadrao;
    }

    const { data: conc, error: erroUpdate } = await supabase
      .from("concursos")
      .update(dadosUpdate)
      .eq("id", concursoId)
      .select("slug, nome")
      .single();

    if (erroUpdate) {
      return { ok: false, mensagem: erroUpdate.message };
    }

    // Se houver perguntas de entrevista, sincronizar também com roteiros_entrevista
    const perguntasRoteiro = (roteiroConfig as { perguntas?: unknown[] } | undefined)?.perguntas;
    if (conc && Array.isArray(perguntasRoteiro) && perguntasRoteiro.length > 0) {
      const versaoRoteiro = `roteiro-${conc.slug}`;
      await supabase.from("roteiros_entrevista").upsert({
        versao: versaoRoteiro,
        concurso_id: concursoId,
        perguntas: perguntasRoteiro,
        activo: true,
        notas: `Roteiro actualizado para o concurso "${conc.nome}"`,
      });
    }

    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: err instanceof Error ? err.message : "Erro desconhecido." };
  }
}
