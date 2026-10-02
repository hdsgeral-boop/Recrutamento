import { NextResponse, type NextRequest } from "next/server";
import { processarArquivamento, repetirPendentes } from "@/lib/arquivamento";
import { compararSeguro } from "@/lib/auth";

/**
 * ===========================================================================
 * POST /api/arquivar   → arquiva uma candidatura (body: { id })
 * GET  /api/arquivar   → repete todas as que ficaram por concluir
 * ---------------------------------------------------------------------------
 * Rede de segurança para quando o waitUntil da Server Action não chega ao fim
 * (por exemplo, se o Drive estiver lento). Pode ser ligada a um Cron Job da
 * Vercel para correr de hora a hora.
 *
 * Protegida por CRON_SECRET: aceita o cabeçalho Authorization: Bearer <chave>
 * ou o parâmetro ?chave=<chave>.
 * ===========================================================================
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(pedido: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;

  const cabecalho = pedido.headers.get("authorization") ?? "";
  const doCabecalho = cabecalho.replace(/^Bearer\s+/i, "");
  const doEndereco = pedido.nextUrl.searchParams.get("chave") ?? "";

  return compararSeguro(doCabecalho, esperado) || compararSeguro(doEndereco, esperado);
}

export async function POST(pedido: NextRequest) {
  if (!autorizado(pedido)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const { id } = (await pedido.json()) as { id?: string };
    if (!id) return NextResponse.json({ erro: "Falta o id." }, { status: 400 });

    await processarArquivamento(id);
    return NextResponse.json({ ok: true, id });
  } catch (erro) {
    console.error("[api/arquivar] erro:", erro);
    return NextResponse.json({ erro: "Falhou o arquivamento." }, { status: 500 });
  }
}

export async function GET(pedido: NextRequest) {
  if (!autorizado(pedido)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const resultado = await repetirPendentes(10);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    console.error("[api/arquivar] erro:", erro);
    return NextResponse.json({ erro: "Falhou a repetição." }, { status: 500 });
  }
}
