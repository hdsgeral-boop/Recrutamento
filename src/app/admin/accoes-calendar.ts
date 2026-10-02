"use server";

import { exigir } from "@/lib/utilizadores";
import { testarCalendar, type Diagnostico } from "@/lib/google-calendar";

/**
 * Testa a ligação ao Google Calendar a partir do painel.
 *
 * Cria uma sala a sério daqui a um ano e apaga-a logo a seguir. Listar
 * calendários não provaria nada: `calendar.events` deixa listar sem deixar
 * criar conferências, e essa diferença só se descobriria com cinquenta emails
 * prontos a sair.
 */
export async function testarLigacaoCalendar(): Promise<Diagnostico> {
  try {
    await exigir("configurar");
  } catch (erro) {
    return {
      configurado: false,
      ok: false,
      conta: null,
      mensagem: erro instanceof Error ? erro.message : "Sem permissão.",
    };
  }

  return testarCalendar();
}
