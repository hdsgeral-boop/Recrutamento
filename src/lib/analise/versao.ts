/**
 * ===========================================================================
 * VERSÃO DO MOTOR DE LEITURA
 * ---------------------------------------------------------------------------
 * Entra no `hash_documentos` de cada análise. Quando muda, as análises
 * anteriores deixam de bater certo e o painel oferece-se para as refazer, sem
 * que ninguém tenha de correr SQL nem apagar seja o que for. As linhas
 * antigas ficam na base de dados, com o histórico intacto.
 *
 * Repara que a versão inclui o provedor. Isso é de propósito: no dia em que
 * se puser a chave do Gemini, todas as análises feitas só com o dicionário
 * passam automaticamente a desactualizadas e o painel avisa. Sem isto, a
 * chave nova ficava a não fazer nada até alguém se lembrar de reprocessar.
 * ===========================================================================
 */

/** A parte que só muda quando o código do extractor muda. */
export const VERSAO_EXTRACTOR = "ocr-drive+heuristica-3";

export function versaoMotor(): string {
  if (process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_AI_API_KEY?.trim()) {
    return `${VERSAO_EXTRACTOR}+gemini`;
  }
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return `${VERSAO_EXTRACTOR}+claude`;
  }
  return VERSAO_EXTRACTOR;
}
