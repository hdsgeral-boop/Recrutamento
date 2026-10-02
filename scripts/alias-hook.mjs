import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve as caminho } from "node:path";

/**
 * Faz o "@/..." dos testes apontar para src/, tal como o tsconfig faz na
 * compilação. O node não lê paths do tsconfig, e sem isto os testes teriam de
 * usar caminhos relativos diferentes dos do código de produção - que é
 * exactamente como se acaba a testar uma réplica em vez do código verdadeiro.
 */
const RAIZ = caminho(dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(especificador, contexto, seguinte) {
  // "server-only" é um marcador do Next.js sem conteúdo nenhum. Fora do Next
  // não existe, e não vale a pena que um script de manutenção rebente por
  // causa de um import vazio.
  // O next/headers só existe dentro do Next. Nos guiões de manutenção damos
  // um duplo que devolve cookies vazios: o que se testa aqui são as funções
  // de dados, não a sessão.
  if (especificador === "next/headers" && process.env.ESTUFA_CORREIO) {
    return {
      url: "data:text/javascript,export function cookies(){return{get(){return undefined},set(){},delete(){}}}",
      shortCircuit: true,
    };
  }

  // Com BANCO_LOCAL ligado, o cliente do Supabase é trocado por um duplo que
  // fala com um Postgres local. Assim o guião corre o código VERDADEIRO das
  // contas contra o esquema VERDADEIRO, sem tocar na base de dados de
  // produção nem depender da rede.
  if (especificador === "@/lib/supabase/servidor" && process.env.BANCO_LOCAL) {
    return { url: pathToFileURL("/tmp/supabase-local.mjs").href, shortCircuit: true };
  }

  if (especificador === "server-only") {
    return { url: "data:text/javascript,export{}", shortCircuit: true };
  }

  // Só nos testes: quando ESTUFA_CORREIO está ligado, o nodemailer é trocado
  // por um duplo que guarda as mensagens em memória. Assim testamos o código
  // de envio verdadeiro sem precisar de SMTP - que a sandbox bloqueia.
  if (especificador === "nodemailer" && process.env.ESTUFA_CORREIO) {
    return { url: pathToFileURL("/tmp/stub-nodemailer.mjs").href, shortCircuit: true };
  }

  if (!especificador.startsWith("@/")) return seguinte(especificador, contexto);

  const base = join(RAIZ, "src", especificador.slice(2));

  for (const tentativa of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(tentativa)) {
      // Sem "format": deixamos o node decidir pela extensão, senão um .ts
      // passaria por JavaScript e o strip-types não corria.
      return { url: pathToFileURL(tentativa).href, shortCircuit: true };
    }
  }

  return seguinte(especificador, contexto);
}
