import { NextResponse } from "next/server";
import { processarCandidato } from "@/lib/analise/processar";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { versaoMotor } from "@/lib/analise/versao";

/**
 * POST /api/admin/analises/lote?quantos=3
 *
 * Analisa um punhado de candidaturas que estejam por analisar ou cuja análise
 * tenha sido feita por uma versão anterior do motor de leitura, e devolve
 * quantas ainda faltam. Chamando em ciclo até `restantes` chegar a zero,
 * actualiza-se o ranking inteiro sem nunca passar do tempo de execução da
 * Vercel.
 *
 * Protegida pelo middleware do painel, tal como o resto de /api/admin.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAXIMO_POR_PEDIDO = 5;

export async function POST(pedido: Request) {
  try {
    const { podeNaSessao } = await import("@/lib/utilizadores");
    if (!(await podeNaSessao("analisar"))) {
      return NextResponse.json(
        { ok: false, erro: "Não tens permissão para correr análises." },
        { status: 403 }
      );
    }

    const url = new URL(pedido.url);
    const pedidos = Number(url.searchParams.get("quantos"));
    const quantos = Number.isFinite(pedidos)
      ? Math.min(Math.max(Math.floor(pedidos), 1), MAXIMO_POR_PEDIDO)
      : 3;

    const supabase = criarClienteServidor();

    const [{ data: todos }, { data: feitos }] = await Promise.all([
      supabase.from("candidatos").select("id").order("created_at", { ascending: false }),
      supabase
        .from("analises_candidato")
        .select("candidato_id, pontuacao_detalhe")
        .eq("estado", "concluida"),
    ]);

    const actualizados = new Set(
      (feitos ?? [])
        .filter((f) => (f.pontuacao_detalhe as { motor?: string } | null)?.motor === versaoMotor())
        .map((f) => f.candidato_id as string)
    );

    const porFazer = (todos ?? [])
      .map((c) => c.id as string)
      .filter((id) => !actualizados.has(id));

    const lote = porFazer.slice(0, quantos);
    const r = await Promise.allSettled(lote.map((id) => processarCandidato(id)));

    const boas = r.filter((x) => x.status === "fulfilled" && x.value.ok).length;

    return NextResponse.json({
      ok: true,
      motor: versaoMotor(),
      tratados: lote.length,
      boas,
      mas: lote.length - boas,
      restantes: Math.max(0, porFazer.length - lote.length),
      mensagens: r.map((x) =>
        x.status === "fulfilled" ? x.value.mensagem : `rebentou: ${String(x.reason).slice(0, 120)}`
      ),
    });
  } catch (erro) {
    console.error("[analises/lote] erro:", erro);
    return NextResponse.json(
      { ok: false, erro: erro instanceof Error ? erro.message : String(erro) },
      { status: 500 }
    );
  }
}
