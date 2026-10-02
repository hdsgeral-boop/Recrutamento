/**
 * ===========================================================================
 * MOTOR DE INTERPOLAÇÃO DE MODELOS DE EMAIL
 * ---------------------------------------------------------------------------
 * Função pura e segura para substituir variáveis em modelos de texto e HTML.
 * Sem dependências externas, com protecção contra injecção e XSS.
 * ===========================================================================
 */

/**
 * Escapa caracteres reservados em HTML para prevenir quebras de layout
 * e ataques de injecção (XSS) em clientes de correio.
 */
export function escaparHtml(valor: string | null | undefined): string {
  if (!valor) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type VariaveisModelo = Record<string, string | number | boolean | null | undefined>;

/**
 * Substitui marcadores {{chave}} num texto simples sem aplicar escape HTML.
 * Usado para assuntos e corpos de texto (plain text).
 */
export function interpolarTexto(template: string, variaveis: VariaveisModelo): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_match, chave: string) => {
    const valor = variaveis[chave];
    if (valor === undefined || valor === null) return "";
    return String(valor);
  });
}

/**
 * Substitui marcadores {{chave}} em HTML, aplicando escape HTML em todos
 * os valores inseridos para garantir segurança e robustez.
 */
export function interpolarHtml(templateHtml: string, variaveis: VariaveisModelo): string {
  if (!templateHtml) return "";
  return templateHtml.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_match, chave: string) => {
    const valor = variaveis[chave];
    if (valor === undefined || valor === null) return "";
    return escaparHtml(String(valor));
  });
}
