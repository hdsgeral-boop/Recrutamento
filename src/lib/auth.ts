/**
 * ===========================================================================
 * AUTENTICAÇÃO DO PAINEL ADMIN
 * ---------------------------------------------------------------------------
 * Login simples com utilizador/palavra-passe vindos das variáveis de ambiente
 * ADMIN_USER e ADMIN_PASS. Depois do login, guardamos um cookie assinado com
 * HMAC-SHA256 - o middleware valida-o em cada pedido a /admin.
 *
 * Usa só Web Crypto, para correr tanto no Edge (middleware) como no Node.
 * ===========================================================================
 */

import { papelValido, type Papel } from "@/lib/permissoes";

export const COOKIE_SESSAO = "consulvolt_admin";
const VALIDADE_HORAS = 12;

/** Quem está ligado, tal como vive dentro do cookie assinado. */
export interface Sessao {
  utilizador: string;
  nome: string;
  papel: Papel;
  /** true enquanto a conta ainda usa a palavra-passe que o sistema gerou. */
  deveTrocar: boolean;
  /**
   * Função de recrutador ligada. Serve para MOSTRAR a área de Entrevistas.
   * Nunca serve para autorizar uma entrevista concreta: essa decisão lê a
   * atribuição na base de dados no momento da acção, porque o cookie pode ter
   * até 12 horas e uma atribuição pode mudar a qualquer momento.
   */
  eRecrutador: boolean;
  expira: number;
}

const codificador = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64url(texto: string): ArrayBuffer {
  const norm = texto.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  // Devolvemos um ArrayBuffer próprio: é o que a Web Crypto e o TextDecoder esperam.
  const buffer = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return buffer;
}

function segredo(): string {
  // Se ADMIN_SESSION_SECRET não estiver definido, derivamos do par utilizador/
  // palavra-passe. Funciona, mas convém definir o segredo próprio em produção.
  return (
    process.env.ADMIN_SESSION_SECRET ||
    `${process.env.ADMIN_USER ?? "admin"}:${process.env.ADMIN_PASS ?? "sem-segredo"}`
  );
}

async function chaveHmac(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    codificador.encode(segredo()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Compara duas cadeias em tempo constante (evita timing attacks). */
export function compararSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** Confere as credenciais introduzidas no formulário de login. */
export function credenciaisValidas(utilizador: string, palavraPasse: string): boolean {
  const u = process.env.ADMIN_USER;
  const p = process.env.ADMIN_PASS;
  if (!u || !p) return false;
  return compararSeguro(utilizador.trim(), u) && compararSeguro(palavraPasse, p);
}

/**
 * Cria o valor do cookie de sessão, já assinado.
 *
 * O nome e o papel viajam dentro do cookie, e não na base de dados, para o
 * middleware (que corre no Edge) poder decidir sem fazer uma consulta em cada
 * pedido. Como o cookie vai assinado com HMAC, ninguém se promove a
 * administrador editando o browser: a assinatura deixaria de bater certo.
 *
 * O reverso: mudar o papel de alguém só faz efeito quando essa pessoa voltar
 * a entrar, no máximo 12 horas depois. Está documentado no ecrã de gestão.
 */
export async function criarSessao(
  utilizador: string,
  nome = utilizador,
  papel: Papel = "admin",
  deveTrocar = false,
  eRecrutador = false
): Promise<string> {
  const dados = JSON.stringify({
    u: utilizador,
    n: nome,
    p: papel,
    t: deveTrocar ? 1 : 0,
    r: eRecrutador ? 1 : 0,
    exp: Date.now() + VALIDADE_HORAS * 60 * 60 * 1000,
  });

  const corpo = base64url(codificador.encode(dados));
  const assinatura = await crypto.subtle.sign("HMAC", await chaveHmac(), codificador.encode(corpo));

  return `${corpo}.${base64url(new Uint8Array(assinatura))}`;
}

/** Valida o cookie: assinatura correcta e ainda dentro da validade. */
export async function sessaoValida(token: string | undefined | null): Promise<boolean> {
  if (!token || !token.includes(".")) return false;

  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return false;

  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await chaveHmac(),
      deBase64url(assinatura),
      codificador.encode(corpo)
    );
    if (!ok) return false;

    const dados = JSON.parse(new TextDecoder().decode(deBase64url(corpo))) as { exp?: number };
    return typeof dados.exp === "number" && dados.exp > Date.now();
  } catch {
    return false;
  }
}

/**
 * Lê a sessão do cookie, confirmando a assinatura.
 * Devolve null se o cookie for inválido, adulterado ou já expirado.
 */
export async function lerSessao(token: string | undefined | null): Promise<Sessao | null> {
  if (!token || !token.includes(".")) return null;

  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return null;

  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await chaveHmac(),
      deBase64url(assinatura),
      codificador.encode(corpo)
    );
    if (!ok) return null;

    const dados = JSON.parse(new TextDecoder().decode(deBase64url(corpo))) as {
      u?: string;
      n?: string;
      p?: string;
      t?: number;
      r?: number;
      exp?: number;
    };

    if (typeof dados.exp !== "number" || dados.exp <= Date.now()) return null;

    return {
      utilizador: dados.u ?? "",
      // Sessões criadas antes desta versão não têm nome nem papel. Ficam com
      // o utilizador como nome e papel de administrador, que era o único que
      // existia - e expiram sozinhas dentro de 12 horas.
      nome: dados.n ?? dados.u ?? "",
      papel: papelValido(dados.p ?? "admin"),
      deveTrocar: dados.t === 1,
      eRecrutador: dados.r === 1,
      expira: dados.exp,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PALAVRAS-PASSE
// ---------------------------------------------------------------------------

const ITERACOES = 120_000;

/**
 * Deriva a palavra-passe com PBKDF2-SHA256 e devolve "iteracoes.sal.derivada".
 * Guardar isto na base de dados é seguro: mesmo com a tabela toda na mão,
 * ninguém recupera as palavras-passe.
 */
export async function moerPalavraPasse(palavraPasse: string, salBase64?: string): Promise<string> {
  const sal = salBase64
    ? new Uint8Array(deBase64url(salBase64))
    : crypto.getRandomValues(new Uint8Array(16));

  const material = await crypto.subtle.importKey(
    "raw",
    codificador.encode(palavraPasse),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: sal, iterations: ITERACOES, hash: "SHA-256" },
    material,
    256
  );

  return `${ITERACOES}.${base64url(sal)}.${base64url(new Uint8Array(bits))}`;
}

/** Confere uma palavra-passe contra o que está guardado. */
export async function confirmarPalavraPasse(
  palavraPasse: string,
  guardado: string
): Promise<boolean> {
  const partes = guardado.split(".");
  if (partes.length !== 3) return false;

  const [, sal] = partes;

  try {
    const recalculado = await moerPalavraPasse(palavraPasse, sal);
    return compararSeguro(recalculado, guardado);
  } catch {
    return false;
  }
}

/**
 * Gera uma palavra-passe forte e legível ao telefone.
 *
 * Sem "l", "I", "1", "0" nem "O": estas contas são entregues por email e
 * lidas em voz alta ou copiadas à mão, e um "l" confundido com um "1" gasta
 * uma chamada telefónica de cada vez.
 *
 * Corre no servidor. O administrador nunca chega a ver o resultado: vai
 * directo para o email da pessoa e para a função de resumo.
 */
export function gerarPalavraPasse(comprimento = 14): string {
  const minusculas = "abcdefghijkmnpqrstuvwxyz";
  const maiusculas = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const algarismos = "23456789";
  const todos = minusculas + maiusculas + algarismos;

  const bytes = crypto.getRandomValues(new Uint8Array(comprimento));
  const saida: string[] = [];

  // As três primeiras casas garantem que passa nas regras mínimas.
  const fontes = [minusculas, maiusculas, algarismos];

  for (let i = 0; i < comprimento; i++) {
    const fonte = i < fontes.length ? fontes[i] : todos;
    saida.push(fonte[bytes[i] % fonte.length]);
  }

  // Baralhar, para os três primeiros caracteres não terem sempre a mesma forma.
  const ordem = crypto.getRandomValues(new Uint8Array(comprimento));
  for (let i = comprimento - 1; i > 0; i--) {
    const j = ordem[i] % (i + 1);
    [saida[i], saida[j]] = [saida[j], saida[i]];
  }

  return saida.join("");
}

/** Regras mínimas da palavra-passe, para não se criarem contas frágeis. */
export function palavraPasseFraca(palavraPasse: string): string | null {
  if (palavraPasse.length < 10) return "A palavra-passe tem de ter pelo menos 10 caracteres.";
  if (!/[a-zA-Z]/.test(palavraPasse)) return "A palavra-passe tem de ter pelo menos uma letra.";
  if (!/\d/.test(palavraPasse)) return "A palavra-passe tem de ter pelo menos um algarismo.";
  return null;
}

/** Opções do cookie de sessão. */
export const opcoesCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: VALIDADE_HORAS * 60 * 60,
};
