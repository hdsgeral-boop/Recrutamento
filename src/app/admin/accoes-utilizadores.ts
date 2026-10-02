"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { COOKIE_SESSAO, criarSessao, opcoesCookie, palavraPasseFraca } from "@/lib/auth";
import { papelValido, type Papel } from "@/lib/permissoes";
import { EMPRESA } from "@/lib/constantes";
import { emailValido } from "@/lib/validacoes";
import {
  actualizarPerfilProprio,
  actualizarUtilizador,
  administradoresActivos,
  apagarUtilizador,
  criarUtilizador,
  exigir,
  listarUtilizadores,
  marcarCredenciaisEnviadas,
  obterConta,
  reporPalavraPasse,
  sessaoActual,
  trocarPalavraPassePropria,
} from "@/lib/utilizadores";

/**
 * ===========================================================================
 * ACÇÕES DAS CONTAS
 * ---------------------------------------------------------------------------
 * Todas começam por exigir a capacidade. A interface já esconde este ecrã a
 * quem não é administrador, mas esconder um botão não impede ninguém de
 * chamar a acção à mão - a verificação tem de estar aqui.
 *
 * Princípio que atravessa este ficheiro: a palavra-passe NUNCA volta para a
 * interface. É gerada no servidor, cifrada, posta no email da pessoa, e
 * esquecida. O administrador cria contas e repõe palavras-passe, mas não
 * consegue entrar em nenhuma delas.
 * ===========================================================================
 */

export interface Resposta {
  ok: boolean;
  mensagem: string;
}

const falhou = (erro: unknown): Resposta => ({
  ok: false,
  mensagem: erro instanceof Error ? erro.message : "Não foi possível concluir.",
});

/** O endereço do painel, para o botão do email. */
function enderecoDoPainel(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/admin/login`;
}

// ------------------------------------------------------------------- CRIAR

export async function criarConta(dados: {
  utilizador: string;
  nome: string;
  email: string;
  telefone: string;
  papel: string;
}): Promise<Resposta> {
  try {
    const sessao = await exigir("gerir_utilizadores");

    if (!dados.utilizador.trim() || !dados.nome.trim()) {
      return { ok: false, mensagem: "O nome de utilizador e o nome da pessoa são obrigatórios." };
    }

    if (!/^[a-z0-9._-]{3,32}$/i.test(dados.utilizador.trim())) {
      return {
        ok: false,
        mensagem: "O nome de utilizador só aceita letras, números, ponto, traço e underscore.",
      };
    }

    // O email é obrigatório porque é por lá que a palavra-passe chega. Sem
    // email não há maneira de entregar as credenciais a ninguém.
    if (!dados.email.trim()) {
      return {
        ok: false,
        mensagem: "O email é obrigatório: é para lá que vai a palavra-passe da conta.",
      };
    }

    if (!emailValido(dados.email.trim())) {
      return { ok: false, mensagem: "Esse email não parece válido. Confirma antes de gravar." };
    }

    const r = await criarUtilizador({
      utilizador: dados.utilizador,
      nome: dados.nome,
      email: dados.email,
      telefone: dados.telefone || null,
      papel: papelValido(dados.papel),
      criadoPor: sessao.utilizador,
    });

    if (!r.ok || !r.conta || !r.palavraPasse) return r;

    // O email é a única forma de a palavra-passe chegar a alguém.
    const { enviarEmailContaCriada } = await import("@/lib/email");
    const envio = await enviarEmailContaCriada(
      {
        nome: r.conta.nome,
        utilizador: r.conta.utilizador,
        email: r.conta.email,
        papel: papelValido(dados.papel),
      },
      r.palavraPasse,
      enderecoDoPainel(),
      sessao.utilizador
    );

    if (envio.ok) await marcarCredenciaisEnviadas(r.conta.id);

    revalidatePath("/admin/utilizadores");

    return {
      ok: true,
      mensagem: envio.ok
        ? `Conta criada. A palavra-passe seguiu para ${r.conta.email}.`
        : `Conta criada, mas o email NÃO saiu (${(envio.erro ?? "").slice(0, 70)}). Usa "Repor palavra-passe" para tentar outra vez.`,
    };
  } catch (erro) {
    return falhou(erro);
  }
}

// ------------------------------------------------------------------- EDITAR

export async function actualizarDados(
  id: string,
  dados: { nome: string; email: string; telefone: string; papel: string }
): Promise<Resposta> {
  try {
    await exigir("gerir_utilizadores");

    if (!dados.nome.trim()) return { ok: false, mensagem: "O nome é obrigatório." };
    if (!dados.email.trim() || !emailValido(dados.email.trim())) {
      return { ok: false, mensagem: "O email é obrigatório e tem de ser válido." };
    }

    const novo: Papel = papelValido(dados.papel);
    if (novo !== "admin" && (await ficariaSemAdmin(id))) {
      return {
        ok: false,
        mensagem:
          "Este é o último administrador activo. Promove outra pessoa antes de lhe mudar o papel.",
      };
    }

    const r = await actualizarUtilizador(id, {
      nome: dados.nome.trim(),
      email: dados.email.trim().toLowerCase(),
      telefone: dados.telefone.trim() || null,
      papel: novo,
    });

    revalidatePath("/admin/utilizadores");
    return r.ok
      ? { ok: true, mensagem: "Conta actualizada. Se mudaste o papel, faz efeito no próximo acesso." }
      : r;
  } catch (erro) {
    return falhou(erro);
  }
}

export async function activarConta(id: string, activo: boolean): Promise<Resposta> {
  try {
    await exigir("gerir_utilizadores");

    if (!activo && (await ficariaSemAdmin(id))) {
      return {
        ok: false,
        mensagem: "Este é o último administrador activo. Não pode ser desactivado.",
      };
    }

    const r = await actualizarUtilizador(id, { activo });
    revalidatePath("/admin/utilizadores");
    return r.ok
      ? {
          ok: true,
          mensagem: activo
            ? "Conta reactivada."
            : "Conta desactivada. A sessão que estiver aberta cai dentro de 12 horas.",
        }
      : r;
  } catch (erro) {
    return falhou(erro);
  }
}

export async function apagarConta(id: string): Promise<Resposta> {
  try {
    const sessao = await exigir("gerir_utilizadores");

    const { lista } = await listarUtilizadores();
    const alvo = lista.find((u) => u.id === id);
    if (!alvo) return { ok: false, mensagem: "Conta não encontrada." };

    if (alvo.utilizador === sessao.utilizador) {
      return { ok: false, mensagem: "Não podes apagar a tua própria conta." };
    }

    if (await ficariaSemAdmin(id)) {
      return { ok: false, mensagem: "Este é o último administrador activo. Não pode ser apagado." };
    }

    const r = await apagarUtilizador(id);
    revalidatePath("/admin/utilizadores");
    return r;
  } catch (erro) {
    return falhou(erro);
  }
}

// --------------------------------------------------------- PALAVRA-PASSE

/**
 * Repõe a palavra-passe e manda-a por email.
 * O administrador não a vê: só fica a saber para onde foi.
 */
export async function pedirNovaPalavraPasse(id: string): Promise<Resposta> {
  try {
    const sessao = await exigir("gerir_utilizadores");

    const r = await reporPalavraPasse(id);
    if (!r.ok || !r.conta || !r.palavraPasse) return { ok: false, mensagem: r.mensagem };

    const { enviarEmailPalavraPasseReposta } = await import("@/lib/email");
    const envio = await enviarEmailPalavraPasseReposta(
      { nome: r.conta.nome, utilizador: r.conta.utilizador, email: r.conta.email },
      r.palavraPasse,
      enderecoDoPainel(),
      sessao.utilizador
    );

    revalidatePath("/admin/utilizadores");

    return envio.ok
      ? {
          ok: true,
          mensagem: `Palavra-passe nova enviada para ${r.conta.email}. A anterior deixou de funcionar.`,
        }
      : {
          ok: false,
          mensagem: `A palavra-passe foi mudada mas o email NÃO saiu (${(envio.erro ?? "").slice(0, 70)}). A pessoa ficou sem acesso: tenta outra vez.`,
        };
  } catch (erro) {
    return falhou(erro);
  }
}

/** A própria pessoa troca a sua palavra-passe. */
export async function trocarMinhaPalavraPasse(dados: {
  actual: string;
  nova: string;
  confirmacao: string;
}): Promise<Resposta> {
  try {
    const sessao = await sessaoActual();
    if (!sessao) return { ok: false, mensagem: "Sessão terminada. Volta a entrar." };

    if (dados.nova !== dados.confirmacao) {
      return { ok: false, mensagem: "As duas palavras-passe novas não são iguais." };
    }

    const fraca = palavraPasseFraca(dados.nova);
    if (fraca) return { ok: false, mensagem: fraca };

    const r = await trocarPalavraPassePropria(sessao.utilizador, dados.actual, dados.nova);
    if (!r.ok) return r;

    // A sessão levava a marca de "tem de trocar". Emitimos outra sem ela,
    // senão a pessoa trocava e continuava presa no mesmo ecrã.
    cookies().set(
      COOKIE_SESSAO,
      await criarSessao(sessao.utilizador, sessao.nome, sessao.papel, false, sessao.eRecrutador),
      opcoesCookie
    );

    revalidatePath("/admin");
    return { ok: true, mensagem: "Palavra-passe alterada. Já podes usar o painel." };
  } catch (erro) {
    return falhou(erro);
  }
}

// ------------------------------------------------------------------ PERFIL

export async function actualizarMeuPerfil(dados: {
  nome: string;
  telefone: string;
}): Promise<Resposta> {
  try {
    const sessao = await sessaoActual();
    if (!sessao) return { ok: false, mensagem: "Sessão terminada. Volta a entrar." };

    if (!dados.nome.trim()) return { ok: false, mensagem: "O nome não pode ficar vazio." };

    const conta = await obterConta(sessao.utilizador);
    if (!conta) {
      return {
        ok: false,
        mensagem:
          "Esta sessão é o acesso de recurso das variáveis de ambiente e não tem ficha para editar.",
      };
    }

    const r = await actualizarPerfilProprio(sessao.utilizador, {
      nome: dados.nome,
      telefone: dados.telefone || null,
    });

    if (!r.ok) return r;

    // O nome viaja no cookie, por isso tem de ser reemitido para o cabeçalho
    // deixar de mostrar o nome antigo.
    cookies().set(
      COOKIE_SESSAO,
      await criarSessao(sessao.utilizador, dados.nome.trim(), sessao.papel, sessao.deveTrocar, sessao.eRecrutador),
      opcoesCookie
    );

    revalidatePath("/admin/perfil");
    revalidatePath("/admin");
    return { ok: true, mensagem: `Dados actualizados. Bom trabalho, ${dados.nome.split(" ")[0]}.` };
  } catch (erro) {
    return falhou(erro);
  }
}

// ------------------------------------------------------------------- APOIO

/** true se mexer nesta conta deixar o sistema sem nenhum administrador activo. */
async function ficariaSemAdmin(id: string): Promise<boolean> {
  const { lista } = await listarUtilizadores();
  const alvo = lista.find((u) => u.id === id);
  if (!alvo || alvo.papel !== "admin" || !alvo.activo) return false;
  return (await administradoresActivos()) <= 1;
}

/** Só para a interface saber o nome da empresa sem o importar do cliente. */
export async function nomeDaEmpresa(): Promise<string> {
  return EMPRESA.nome;
}
