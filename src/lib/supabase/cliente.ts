import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para o BROWSER (chave anon).
 * Pelas políticas de RLS, só consegue INSERIR candidaturas e enviar
 * ficheiros para o bucket. Não lê dados de ninguém.
 */
export function criarClienteBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !chave) {
    throw new Error(
      "Faltam as variáveis NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
