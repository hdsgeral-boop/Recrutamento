import { NextResponse } from "next/server";
import { processarPendentes } from "@/lib/analise/processar";

/**
 * POST /api/admin/analises/pendentes
 * Rede de segurança: apanha as análises que ficaram por concluir há mais de
 * uma hora, com menos de 3 tentativas. Protegida pelo middleware do painel.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const r = await processarPendentes();
    return NextResponse.json({ ok: true, ...r });
  } catch (erro) {
    console.error("[analises/pendentes] erro:", erro);
    return NextResponse.json(
      { ok: false, erro: erro instanceof Error ? erro.message : String(erro) },
      { status: 500 }
    );
  }
}
