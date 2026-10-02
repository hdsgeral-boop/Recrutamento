import "server-only";
import { cookies } from "next/headers";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import {
  COOKIE_SESSAO,
  compararSeguro,
  confirmarPalavraPasse,
  gerarPalavraPasse,
  lerSessao,
  moerPalavraPasse,
  type Sessao,
} from "@/lib/auth";
import { pode, papelValido, type Capacidade, type Papel } from "@/lib/permissoes";

/**
 * ===========================================================================
 * CONTAS DO PAINEL
 * ---------------------------------------------------------------------------
 * As contas vivem na tabela utilizadores_painel. O par ADMIN_USER/ADMIN_PASS
 * das variáveis de ambiente continua a funcionar como administrador de
 * recurso: se alguém desactivar por engano o último administrador, ainda há
 * maneira de entrar e corrigir. Esse acesso não aparece na lista de contas
 * porque não é uma conta - é uma chave de emergência.
 * ===========================================================================
 */

export interface UtilizadorPainel {
  id: string;
  utilizador: string;
  nome: string;
  email: string;
  telefone: string | null;
  papel: Papel;
  /** Função temporária de recrutador. Independente do papel. */
  e_recrutador: boolean;
  activo: boolean;
  criado_em: string;
  criado_por: string | null;
  ultimo_acesso: string | null;
  deve_trocar_palavra_passe: boolean;
  palavra_passe_alterada_em: string | null;
  credenciais_enviadas_em: string | null;
}

/** As colunas que o painel lê. Nunca inclui palavra_passe_hash. */
const COLUNAS =
  "id, utilizador, nome, email, telefone, papel, e_recrutador, activo, criado_em, criado_por, ultimo_acesso, deve_trocar_palavra_passe, palavra_passe_alterada_em, credenciais_enviadas_em";

export interface Autenticado {
  utilizador: string;
  nome: string;
  papel: Papel;
  /** true enquanto usar a palavra-passe que o sistema gerou. */
  deveTrocar: boolean;
  /** true quando entrou pelo par das variáveis de ambiente. */
  deRecurso: boolean;
  /** Função temporária de recrutador. */
  eRecrutador: boolean;
}

const UTILIZADOR_DE_RECURSO = () => process.env.ADMIN_USER?.trim() ?? "";

/**
 * Confere as credenciais.
 * Devolve null quando não conferem, sem dizer qual das duas falhou.
 */
export async function autenticar(
  utilizador: string,
  palavraPasse: string
): Promise<Autenticado | null> {
  const nome = utilizador.trim();
  if (!nome || !palavraPasse) return null;

  // 1. Conta na base de dados.
  try {
    const { data } = await criarClienteServidor()
      .from("utilizadores_painel")
      .select("*")
      .eq("utilizador", nome)
      .maybeSingle();

    const conta = data as UtilizadorPainel & { palavra_passe_hash: string } | null;

    if (conta) {
      if (!conta.activo) return null;
      if (!(await confirmarPalavraPasse(palavraPasse, conta.palavra_passe_hash))) return null;

      // Melhor esforço: saber quem entrou e quando ajuda a auditar.
      criarClienteServidor()
        .from("utilizadores_painel")
        .update({ ultimo_acesso: new Date().toISOString() })
        .eq("id", conta.id)
        .then(undefined, () => undefined);

      return {
        utilizador: conta.utilizador,
        nome: conta.nome,
        papel: papelValido(conta.papel),
        deveTrocar: Boolean(conta.deve_trocar_palavra_passe),
        deRecurso: false,
        // A coluna pode ainda não existir, se a migração não correu. Sem ela,
        // ninguém é recrutador - que é o estado seguro.
        eRecrutador: Boolean(conta.e_recrutador),
      };
    }
  } catch (erro) {
    // A tabela pode ainda não existir, se a migração não correu. Não é motivo
    // para trancar toda a gente à porta: cai-se no acesso de recurso.
    console.error("[utilizadores] não consegui ler a tabela:", erro);
  }

  // 2. Acesso de recurso pelas variáveis de ambiente.
  const u = UTILIZADOR_DE_RECURSO();
  const p = process.env.ADMIN_PASS;

  if (u && p && compararSeguro(nome, u) && compararSeguro(palavraPasse, p)) {
    return {
      utilizador: u,
      nome: "Administrador",
      papel: "admin",
      // O acesso de recurso vem das variáveis de ambiente; não há palavra-passe
      // gerada para trocar, e obrigar a trocar deixaria o dono fechado à porta.
      deveTrocar: false,
      deRecurso: true,
      // O acesso de recurso é administrador: já entrevista tudo pelo papel.
      eRecrutador: false,
    };
  }

  return null;
}

/** Quem está ligado neste pedido, a partir do cookie assinado. */
export async function sessaoActual(): Promise<Sessao | null> {
  return lerSessao(cookies().get(COOKIE_SESSAO)?.value);
}

/**
 * Exige uma capacidade. Atira se faltar.
 *
 * É isto que protege de verdade: a interface esconde botões por cortesia, mas
 * quem construir o pedido à mão bate aqui na mesma.
 */
export async function exigir(capacidade: Capacidade): Promise<Sessao> {
  const sessao = await sessaoActual();
  if (!sessao) throw new Error("Sessão terminada. Volta a entrar no painel.");

  if (!pode(sessao.papel, capacidade)) {
    throw new Error("Não tens permissão para esta operação. Fala com um administrador.");
  }

  return sessao;
}

/** Versão que não atira, para as páginas decidirem o que mostrar. */
export async function podeNaSessao(capacidade: Capacidade): Promise<boolean> {
  const sessao = await sessaoActual();
  return pode(sessao?.papel, capacidade);
}

// ---------------------------------------------------------------------- CRUD

export async function listarUtilizadores(): Promise<{
  lista: UtilizadorPainel[];
  erro: string | null;
}> {
  const { data, error } = await criarClienteServidor()
    .from("utilizadores_painel")
    .select(COLUNAS)
    .order("criado_em", { ascending: true });

  if (error) return { lista: [], erro: error.message };
  return { lista: (data ?? []) as UtilizadorPainel[], erro: null };
}

/**
 * Cria a conta com uma palavra-passe GERADA pelo sistema.
 *
 * A palavra-passe volta daqui apenas para ser posta no email. Não é gravada
 * em lado nenhum em claro, não é devolvida à interface e o administrador
 * nunca a vê - foi isso que se pediu, e é também a prática certa: quem cria
 * a conta não deve poder entrar nela.
 */
export async function criarUtilizador(dados: {
  utilizador: string;
  nome: string;
  email: string;
  telefone: string | null;
  papel: Papel;
  criadoPor: string;
}): Promise<{ ok: boolean; mensagem: string; conta?: UtilizadorPainel; palavraPasse?: string }> {
  const supabase = criarClienteServidor();
  const palavraPasse = gerarPalavraPasse();

  const { data, error } = await supabase
    .from("utilizadores_painel")
    .insert({
      utilizador: dados.utilizador.trim().toLowerCase(),
      nome: dados.nome.trim(),
      email: dados.email.trim().toLowerCase(),
      telefone: dados.telefone?.trim() || null,
      papel: dados.papel,
      palavra_passe_hash: await moerPalavraPasse(palavraPasse),
      deve_trocar_palavra_passe: true,
      criado_por: dados.criadoPor,
    })
    .select(COLUNAS)
    .single();

  if (error) {
    return {
      ok: false,
      mensagem:
        error.message.includes("duplicate") || error.message.includes("unique")
          ? "Já existe uma conta com esse nome de utilizador."
          : error.message,
    };
  }

  return {
    ok: true,
    mensagem: `Conta de ${dados.nome} criada.`,
    conta: data as UtilizadorPainel,
    palavraPasse,
  };
}

/**
 * Gera uma palavra-passe nova para uma conta e volta a marcá-la para troca.
 * Devolve a palavra-passe só para ir no email.
 */
export async function reporPalavraPasse(
  id: string
): Promise<{ ok: boolean; mensagem: string; conta?: UtilizadorPainel; palavraPasse?: string }> {
  const supabase = criarClienteServidor();
  const palavraPasse = gerarPalavraPasse();

  const { data, error } = await supabase
    .from("utilizadores_painel")
    .update({
      palavra_passe_hash: await moerPalavraPasse(palavraPasse),
      deve_trocar_palavra_passe: true,
      credenciais_enviadas_em: new Date().toISOString(),
    })
    .eq("id", id)
    .select(COLUNAS)
    .single();

  if (error) return { ok: false, mensagem: error.message };

  return { ok: true, mensagem: "Palavra-passe reposta.", conta: data as UtilizadorPainel, palavraPasse };
}

/** Marca que as credenciais saíram por email. */
export async function marcarCredenciaisEnviadas(id: string): Promise<void> {
  await criarClienteServidor()
    .from("utilizadores_painel")
    .update({ credenciais_enviadas_em: new Date().toISOString() })
    .eq("id", id);
}

/**
 * A própria pessoa escolhe a sua palavra-passe. Levanta a obrigação de trocar.
 * Exige a palavra-passe actual, para um cookie roubado não bastar.
 */
export async function trocarPalavraPassePropria(
  utilizador: string,
  actual: string,
  nova: string
): Promise<{ ok: boolean; mensagem: string }> {
  const supabase = criarClienteServidor();

  const { data } = await supabase
    .from("utilizadores_painel")
    .select("id, palavra_passe_hash")
    .eq("utilizador", utilizador)
    .maybeSingle();

  if (!data) {
    return {
      ok: false,
      mensagem:
        "Esta sessão é o acesso de recurso das variáveis de ambiente e não tem palavra-passe para trocar aqui.",
    };
  }

  if (!(await confirmarPalavraPasse(actual, data.palavra_passe_hash as string))) {
    return { ok: false, mensagem: "A palavra-passe actual não confere." };
  }

  if (await confirmarPalavraPasse(nova, data.palavra_passe_hash as string)) {
    return { ok: false, mensagem: "A palavra-passe nova tem de ser diferente da actual." };
  }

  const { error } = await supabase
    .from("utilizadores_painel")
    .update({
      palavra_passe_hash: await moerPalavraPasse(nova),
      deve_trocar_palavra_passe: false,
      palavra_passe_alterada_em: new Date().toISOString(),
    })
    .eq("id", data.id as string);

  return error
    ? { ok: false, mensagem: error.message }
    : { ok: true, mensagem: "Palavra-passe alterada." };
}

/** Os dados que a própria pessoa pode mudar. O email não está cá de propósito. */
export async function actualizarPerfilProprio(
  utilizador: string,
  dados: { nome: string; telefone: string | null }
): Promise<{ ok: boolean; mensagem: string }> {
  const { error } = await criarClienteServidor()
    .from("utilizadores_painel")
    .update({ nome: dados.nome.trim(), telefone: dados.telefone?.trim() || null })
    .eq("utilizador", utilizador);

  return error
    ? { ok: false, mensagem: error.message }
    : { ok: true, mensagem: "Dados actualizados." };
}

/** A conta de quem está ligado, para a vista de dados pessoais. */
export async function obterConta(utilizador: string): Promise<UtilizadorPainel | null> {
  const { data } = await criarClienteServidor()
    .from("utilizadores_painel")
    .select(COLUNAS)
    .eq("utilizador", utilizador)
    .maybeSingle();

  return (data as UtilizadorPainel) ?? null;
}

/** Apaga uma conta de vez. O histórico de emails enviados fica. */
export async function apagarUtilizador(id: string): Promise<{ ok: boolean; mensagem: string }> {
  const { error } = await criarClienteServidor()
    .from("utilizadores_painel")
    .delete()
    .eq("id", id);

  return error
    ? { ok: false, mensagem: error.message }
    : { ok: true, mensagem: "Conta apagada." };
}

export async function actualizarUtilizador(
  id: string,
  mudancas: {
    nome?: string;
    email?: string;
    telefone?: string | null;
    papel?: Papel;
    activo?: boolean;
  }
): Promise<{ ok: boolean; mensagem: string }> {
  const { error } = await criarClienteServidor()
    .from("utilizadores_painel")
    .update(mudancas)
    .eq("id", id);

  return error ? { ok: false, mensagem: error.message } : { ok: true, mensagem: "Conta actualizada." };
}

/**
 * Conta quantos administradores activos existem.
 * Serve para impedir que se desactive o último - ficaria uma equipa inteira
 * sem quem crie contas.
 */
export async function administradoresActivos(): Promise<number> {
  const { count } = await criarClienteServidor()
    .from("utilizadores_painel")
    .select("id", { count: "exact", head: true })
    .eq("papel", "admin")
    .eq("activo", true);

  return count ?? 0;
}
