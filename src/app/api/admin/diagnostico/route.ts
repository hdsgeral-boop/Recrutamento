import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { testarLigacaoDrive } from "@/lib/google-drive";
import { testarLigacaoEmail } from "@/lib/email";
import { BUCKET } from "@/lib/constantes";

/**
 * GET /api/admin/diagnostico
 * Verifica, de uma assentada, se o Supabase, o Google Drive e o Gmail estão
 * bem configurados. Protegido pelo middleware. Útil logo a seguir ao deploy.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function testarSupabase() {
  try {
    const supabase = criarClienteServidor();

    const { error: erroTabela } = await supabase
      .from("candidatos")
      .select("id", { count: "exact", head: true });
    if (erroTabela) throw new Error(`tabela candidatos: ${erroTabela.message}`);

    const { error: erroBucket } = await supabase.storage.from(BUCKET).list("", { limit: 1 });
    if (erroBucket) throw new Error(`bucket ${BUCKET}: ${erroBucket.message}`);

    return { ok: true, mensagem: "Tabela e bucket acessíveis." };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** O OCR do Drive: copia um ficheiro real, exporta e apaga o temporário. */
async function testarOcr() {
  try {
    const supabase = criarClienteServidor();
    const { data } = await supabase
      .from("documentos_texto")
      .select("drive_file_id")
      .limit(1)
      .maybeSingle();

    if (!data?.drive_file_id) {
      return {
        ok: true,
        mensagem: "Sem documentos analisados ainda; nada para testar.",
      };
    }

    const { testarOcrDrive } = await import("@/lib/analise/ocr-drive");
    return await testarOcrDrive(data.drive_file_id as string);
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}

export async function GET() {
  const { testarGemini } = await import("@/lib/analise/gemini");
  const { provedorActivo } = await import("@/lib/analise/extrair");

  const [supabase, drive, email, ocr, gemini] = await Promise.all([
    testarSupabase(),
    testarLigacaoDrive(),
    testarLigacaoEmail(),
    testarOcr(),
    testarGemini(),
  ]);

  const variaveis = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    GOOGLE_OAUTH_CLIENT_ID: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
    GOOGLE_OAUTH_CLIENT_SECRET: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    GOOGLE_OAUTH_REFRESH_TOKEN: Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN),
    GOOGLE_SERVICE_ACCOUNT_JSON: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    GOOGLE_DRIVE_FOLDER_ID: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID),
    GMAIL_USER: Boolean(process.env.GMAIL_USER),
    GMAIL_APP_PASSWORD: Boolean(process.env.GMAIL_APP_PASSWORD),
    RH_EMAIL: Boolean(process.env.RH_EMAIL),
    ADMIN_USER: Boolean(process.env.ADMIN_USER),
    ADMIN_PASS: Boolean(process.env.ADMIN_PASS),
    ADMIN_SESSION_SECRET: Boolean(process.env.ADMIN_SESSION_SECRET),
    NEXT_PUBLIC_SITE_URL: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
  };

  // Como é que a análise está a correr, em linguagem de gente.
  const provedor = provedorActivo();
  const analise = {
    ok: true,
    mensagem:
      provedor === "gemini"
        ? "OCR do Google Drive + extractor determinístico + Gemini."
        : provedor === "anthropic"
          ? "OCR do Google Drive + extractor determinístico + Claude."
          : "OCR do Google Drive + extractor determinístico. Sem modelo de linguagem: os critérios que dependem de interpretação do CV vão ficar por baixo do real.",
  };

  const tudoBem = supabase.ok && drive.ok && email.ok;

  return NextResponse.json(
    {
      tudoBem,
      supabase,
      drive,
      email,
      ocr,
      gemini,
      analise,
      variaveis,
      verificadoEm: new Date().toISOString(),
    },
    { status: tudoBem ? 200 : 503 }
  );
}
