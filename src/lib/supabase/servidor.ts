import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para o SERVIDOR (service_role).
 * IGNORA o RLS - por isso nunca pode ser importado por um componente cliente.
 * Usado pelo painel admin, pelas Server Actions e pelo arquivamento.
 */
let cache: SupabaseClient | null = null;

export function criarClienteServidor(): SupabaseClient {
  if (cache) return cache;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chave) {
    throw new Error(
      "Faltam as variáveis NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  cache = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // O Next.js 14 guarda em cache os GET feitos com fetch dentro de Server
      // Components. Sem isto, o painel mostrava para sempre o resultado da
      // primeira consulta - com a tabela vazia, ficava sempre a zero enquanto
      // as consultas filtradas (URL diferente) mostravam os dados certos.
      // Cada pedido ao Supabase tem de ir mesmo à base de dados.
      fetch: (entrada, iniciais = {}) =>
        fetch(entrada as RequestInfo | URL, { ...iniciais, cache: "no-store" }),
    },
  });

  return cache;
}
