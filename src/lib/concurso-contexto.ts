/**
 * ===========================================================================
 * RESOLUÇÃO DO CONCURSO ACTUAL POR SUBDOMÍNIO E CONTEXTO
 * ---------------------------------------------------------------------------
 * Funções puras que descobrem a que concurso um pedido pertence.
 * O concurso governa o isolamento de dados, formulários, prazos e regras.
 * ===========================================================================
 */

export const CABECALHO_CONCURSO_ID = "x-concurso-id";
export const CABECALHO_CONCURSO_SLUG = "x-concurso-slug";
export const COOKIE_CONCURSO_ACTIVO = "cv_concurso_slug";

export const SLUG_PADRAO = "geral";

/**
 * Limpa e normaliza o slug de um concurso:
 * Minúsculas, sem acentos, apenas letras, números e hífen.
 * Sem travessões em lado nenhum (invariante do projecto).
 */
export function normalizarSlug(texto: string): string {
  if (!texto) return "";
  return texto
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[\u2013\u2014]/g, "-") // substitui travessões por hífen
    .replace(/[^a-z0-9-]/g, "-")    // caracteres não permitidos viram hífen
    .replace(/-+/g, "-")            // agrupa hífens repetidos
    .replace(/^-|-$/g, "");         // apara hífens nas pontas
}

/**
 * Extrai o slug do concurso a partir do cabeçalho Host.
 *
 * Suporta:
 *   - Subdomínios de produção: bengo.recrutar.co.ao -> "bengo"
 *   - Vercel previews: bengo-recrutamento.vercel.app ou bengo.recrutamento-consulvolt.vercel.app
 *   - Desenvolvimento local: bengo.localhost:3000 -> "bengo"
 *   - Domínio raiz: recrutar.co.ao -> null
 *   - localhost simples: localhost:3000 -> null
 */
export function extrairSlugDoHost(host: string | null | undefined, dominioBase = "recrutar.co.ao"): string | null {
  if (!host) return null;

  // Retira eventual porta (ex.: localhost:3000)
  const semPorta = host.split(":")[0].toLowerCase().trim();

  // Em localhost: bengo.localhost -> "bengo"
  if (semPorta.endsWith(".localhost")) {
    const partes = semPorta.split(".");
    return partes.length > 1 ? normalizarSlug(partes[0]) : null;
  }

  // No domínio base configurado: {slug}.recrutar.co.ao
  if (semPorta.endsWith(`.${dominioBase}`)) {
    const resto = semPorta.slice(0, -(dominioBase.length + 1));
    return resto ? normalizarSlug(resto) : null;
  }

  // Vercel deployments: {slug}.recrutamento-consulvolt.vercel.app
  if (semPorta.endsWith(".vercel.app")) {
    const partes = semPorta.split(".");
    if (partes.length >= 3) {
      return normalizarSlug(partes[0]);
    }
  }

  return null;
}

/**
 * Lê o concurso actual a partir dos cabeçalhos do pedido HTTP (injetados pelo middleware).
 */
export function concursoDosCabecalhos(headers: Headers): { id: string | null; slug: string | null } {
  const id = headers.get(CABECALHO_CONCURSO_ID);
  const slug = headers.get(CABECALHO_CONCURSO_SLUG);
  return {
    id: id?.trim() || null,
    slug: slug?.trim() || null,
  };
}
