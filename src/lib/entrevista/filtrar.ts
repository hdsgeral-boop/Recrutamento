import { dobrar } from "@/lib/analise/dobrar";
import type { LinhaEntrevista } from "@/lib/entrevista/atribuicoes";
import type { Estado } from "@/lib/entrevista/estados";

/**
 * ===========================================================================
 * FILTRAR A LISTA DE ENTREVISTAS
 * ---------------------------------------------------------------------------
 * Função pura, aplicada no servidor sobre a lista já carregada. Testável sem
 * base de dados, e igual em todas as páginas do módulo - o que evita que a
 * lista dos Agendados e a dos Concluídos filtrem de maneiras ligeiramente
 * diferentes com o tempo.
 *
 * A procura ignora acentos, de propósito. Quem escreve "Sebastiao" à pressa
 * no telemóvel tem de encontrar "Sebastião".
 * ===========================================================================
 */

export interface Criterios {
  q?: string;
  estado?: string;
  /** Um utilizador, ou "sem" para quem ainda não tem recrutador. */
  recrutador?: string;
  grupo?: string;
  municipio?: string;
}

export function filtrarEntrevistas(
  linhas: LinhaEntrevista[],
  c: Criterios,
  estadosDaPagina?: Estado[] | null
): LinhaEntrevista[] {
  let saida = estadosDaPagina?.length
    ? linhas.filter((l) => estadosDaPagina.includes(l.estado))
    : linhas;

  if (c.estado) saida = saida.filter((l) => l.estado === c.estado);

  // Filtrar por recrutador olha para a EQUIPA, não só para o responsável:
  // quem procura "as minhas entrevistas" quer as em que participa, e não só
  // aquelas por que responde.
  if (c.recrutador === "sem") saida = saida.filter((l) => l.recrutadores.length === 0);
  else if (c.recrutador) {
    saida = saida.filter((l) => l.recrutadores.includes(c.recrutador!));
  }

  if (c.grupo) saida = saida.filter((l) => l.experiencia.grupo === c.grupo);
  if (c.municipio) saida = saida.filter((l) => l.municipio === c.municipio);

  const termo = dobrar((c.q ?? "").trim());
  if (termo) {
    saida = saida.filter((l) =>
      [l.nome, l.email, l.municipio, ...l.recrutadores].some((campo) => dobrar(campo).includes(termo))
    );
  }

  return saida;
}
