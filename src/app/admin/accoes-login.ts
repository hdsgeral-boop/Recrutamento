"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, criarSessao, opcoesCookie } from "@/lib/auth";
import { autenticar } from "@/lib/utilizadores";

/** Onde se cai ao entrar no painel sem destino pedido. */
const PAGINA_INICIAL = "/admin/dashboard";

/** Pequeno travão contra tentativas à força bruta, por instância da função. */
const tentativas = new Map<string, { contagem: number; ate: number }>();

function bloqueado(chave: string): boolean {
  const registo = tentativas.get(chave);
  if (!registo) return false;
  if (Date.now() > registo.ate) {
    tentativas.delete(chave);
    return false;
  }
  return registo.contagem >= 5;
}

function falhou(chave: string) {
  const registo = tentativas.get(chave) ?? { contagem: 0, ate: Date.now() + 10 * 60 * 1000 };
  registo.contagem += 1;
  registo.ate = Date.now() + 10 * 60 * 1000;
  tentativas.set(chave, registo);
}

export interface EstadoLogin {
  erro?: string;
}

/** Acção do formulário de login do painel. */
export async function entrar(_anterior: EstadoLogin, dados: FormData): Promise<EstadoLogin> {
  const utilizador = String(dados.get("utilizador") ?? "");
  const palavraPasse = String(dados.get("palavra_passe") ?? "");
  // Sem destino pedido, entra-se no Dashboard. Quem foi barrado a caminho de
  // uma página concreta volta a essa, que é o que estava a tentar fazer.
  const voltar = String(dados.get("voltar") ?? PAGINA_INICIAL);

  if (bloqueado(utilizador)) {
    return { erro: "Demasiadas tentativas falhadas. Espera 10 minutos." };
  }

  if (!utilizador || !palavraPasse) {
    return { erro: "Preenche o utilizador e a palavra-passe." };
  }

  const conta = await autenticar(utilizador, palavraPasse);

  if (!conta) {
    falhou(utilizador);
    return { erro: "Utilizador ou palavra-passe incorrectos." };
  }

  tentativas.delete(utilizador);
  cookies().set(
    COOKIE_SESSAO,
    await criarSessao(conta.utilizador, conta.nome, conta.papel, conta.deveTrocar, conta.eRecrutador),
    opcoesCookie
  );

  // Quem ainda usa a palavra-passe que o sistema gerou vai directo trocá-la,
  // seja qual for a página que estava a tentar abrir.
  if (conta.deveTrocar) redirect("/admin/trocar-palavra-passe");

  // Só aceitamos destinos internos, para não servir de trampolim.
  redirect(voltar.startsWith("/admin") ? voltar : PAGINA_INICIAL);
}

/** Termina a sessão do painel. */
export async function sair() {
  cookies().delete(COOKIE_SESSAO);
  redirect("/admin/login");
}
