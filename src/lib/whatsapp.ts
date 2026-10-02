import { EMPRESA } from "@/lib/constantes";
import type { Candidato } from "@/types/database";

/**
 * Constrói o link wa.me com uma mensagem já escrita, pronta a enviar
 * ao candidato. O número tem de estar no formato internacional sem "+",
 * por exemplo 244923012143.
 */

export type ModeloMensagem = "convocatoria" | "confirmacao" | "documentos" | "reprovado";

const MODELOS: Record<ModeloMensagem, (c: Candidato) => string> = {
  confirmacao: (c) =>
    `Olá ${primeiroNome(c)}, aqui é a equipa de recrutamento da ${EMPRESA.nome}. ` +
    `Confirmamos a recepção da tua candidatura à vaga de ${EMPRESA.vaga} para o ${EMPRESA.projecto}. ` +
    `Vamos analisar o teu processo e damos notícias em breve.`,

  convocatoria: (c) =>
    `Olá ${primeiroNome(c)}, aqui é a equipa de recrutamento da ${EMPRESA.nome}. ` +
    `A tua candidatura a ${EMPRESA.vaga} (${EMPRESA.projecto}) foi seleccionada para entrevista. ` +
    `Podes indicar-nos a tua disponibilidade nos próximos dias? Obrigado.`,

  documentos: (c) =>
    `Olá ${primeiroNome(c)}, aqui é a ${EMPRESA.nome}. ` +
    `Sobre a tua candidatura a ${EMPRESA.vaga}: precisamos que nos envies novamente um dos documentos, ` +
    `porque o ficheiro que recebemos não está legível. Podes reenviar, por favor?`,

  reprovado: (c) =>
    `Olá ${primeiroNome(c)}, aqui é a equipa de recrutamento da ${EMPRESA.nome}. ` +
    `Agradecemos o teu interesse na vaga de ${EMPRESA.vaga}. Desta vez o teu perfil não foi seleccionado, ` +
    `mas ficas na nossa base de dados para futuras oportunidades. Obrigado pela disponibilidade.`,
};

export const ETIQUETAS_MODELO: Record<ModeloMensagem, string> = {
  confirmacao: "Confirmar recepção",
  convocatoria: "Convocar para entrevista",
  documentos: "Pedir documento em falta",
  reprovado: "Comunicar não selecção",
};

function primeiroNome(c: Candidato): string {
  return c.nome.trim().split(/\s+/)[0];
}

/** Deixa apenas dígitos e garante o indicativo 244 de Angola. */
export function numeroInternacional(telefone: string): string {
  let n = telefone.replace(/\D/g, "");
  if (n.startsWith("00244")) n = n.slice(2);
  if (!n.startsWith("244") && n.length === 9) n = `244${n}`;
  return n;
}

/** Devolve o endereço wa.me completo, com a mensagem já codificada. */
export function linkWhatsApp(candidato: Candidato, modelo: ModeloMensagem = "convocatoria"): string {
  const numero = numeroInternacional(candidato.telefone);
  const texto = MODELOS[modelo](candidato);
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
