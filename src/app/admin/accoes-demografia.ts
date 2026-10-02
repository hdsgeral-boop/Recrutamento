"use server";

import { revalidatePath } from "next/cache";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigir } from "@/lib/utilizadores";
import { lerBi } from "@/lib/demografia/bi";

/**
 * ===========================================================================
 * LEITURA DO BI - sexo e data de nascimento
 * ---------------------------------------------------------------------------
 * Não corre OCR nenhum. O texto do BI já está em `documentos_texto` desde a
 * análise documental; esta acção limita-se a lê-lo e a procurar dois factos.
 * Por isso é instantânea, não gasta chamadas ao modelo, e pode correr as
 * vezes que forem precisas sem custo.
 *
 * O QUE ESTA ACÇÃO NUNCA FAZ:
 *  - não toca na pontuação, no ranking nem na rubrica;
 *  - não escreve nada quando não encontra o facto escrito no documento (um
 *    campo vazio é uma resposta honesta, um palpite não é);
 *  - não apaga uma correcção feita à mão. Quem corrigiu viu o documento; o
 *    OCR não viu melhor do que essa pessoa.
 * ===========================================================================
 */

const LOTE_MAXIMO = 200;

export interface ResultadoLeitura {
  ok: boolean;
  /** Quantos passaram a ter pelo menos um dos dois factos. */
  lidos: number;
  /** Quantos tinham texto de BI mas sem os factos lá escritos. */
  semDados: number;
  /** Quantos nem sequer têm o BI lido por OCR. */
  semBi: number;
  /** Quantos foram deixados em paz por terem correcção manual. */
  preservados: number;
  mensagem: string;
}

export async function lerDemografiaDosBis(forcar = false): Promise<ResultadoLeitura> {
  const vazio = (mensagem: string): ResultadoLeitura => ({
    ok: false, lidos: 0, semDados: 0, semBi: 0, preservados: 0, mensagem,
  });

  try {
    await exigir("analisar");
  } catch (erro) {
    return vazio(erro instanceof Error ? erro.message : "Sem permissão.");
  }

  const supabase = criarClienteServidor();

  const { data: candidatosData, error: erroCandidatos } = await supabase
    .from("candidatos")
    .select("id, sexo, data_nascimento, demografia_origem")
    .order("created_at", { ascending: true })
    .limit(2000);

  if (erroCandidatos) {
    if ((erroCandidatos as { code?: string }).code === "42703") {
      return vazio(
        "As colunas do BI ainda não existem no Supabase. Corre a migração 20260922c_dashboard_e_funil.sql primeiro."
      );
    }
    return vazio(erroCandidatos.message.slice(0, 160));
  }

  type Linha = { id: string; sexo: string | null; data_nascimento: string | null; demografia_origem: string | null };
  const todos = (candidatosData ?? []) as Linha[];

  let preservados = 0;
  const porLer = todos.filter((c) => {
    // A correcção de uma pessoa ganha sempre ao OCR, mesmo em modo forçado.
    if (c.demografia_origem === "manual") {
      preservados++;
      return false;
    }
    if (forcar) return true;
    return !c.sexo || !c.data_nascimento;
  });

  if (porLer.length === 0) {
    return {
      ok: true, lidos: 0, semDados: 0, semBi: 0, preservados,
      mensagem: preservados
        ? `Nada por ler. ${preservados} ficha(s) têm correcção manual e ficaram como estão.`
        : "Todas as fichas já tinham os dados lidos.",
    };
  }

  const { data: textosData, error: erroTextos } = await supabase
    .from("documentos_texto")
    .select("candidato_id, texto")
    .eq("tipo_documento", "bi")
    .in("candidato_id", porLer.slice(0, 2000).map((c) => c.id));

  if (erroTextos) return vazio(erroTextos.message.slice(0, 160));

  const textoPorCandidato = new Map<string, string>();
  for (const t of (textosData ?? []) as { candidato_id: string; texto: string | null }[]) {
    const anterior = textoPorCandidato.get(t.candidato_id) ?? "";
    // Alguns candidatos carregam o BI em duas metades. Juntam-se.
    if (t.texto) textoPorCandidato.set(t.candidato_id, `${anterior}\n${t.texto}`.trim());
  }

  const agora = new Date();
  let lidos = 0;
  let semDados = 0;
  let semBi = 0;

  const porGravar: { id: string; sexo: string | null; data_nascimento: string | null }[] = [];

  for (const c of porLer) {
    const texto = textoPorCandidato.get(c.id);
    if (!texto) {
      semBi++;
      continue;
    }

    const leitura = lerBi(texto, agora);
    if (!leitura.sexo && !leitura.nascimento) {
      semDados++;
      continue;
    }

    porGravar.push({
      id: c.id,
      // Só se escreve por cima de um vazio, nunca de um valor que já lá estava.
      sexo: c.sexo ?? leitura.sexo,
      data_nascimento: c.data_nascimento ?? leitura.nascimento,
    });
  }

  // Em lotes, para não montar um pedido gigante num plano Free.
  for (let i = 0; i < porGravar.length; i += LOTE_MAXIMO) {
    const lote = porGravar.slice(i, i + LOTE_MAXIMO);
    await Promise.all(
      lote.map((l) =>
        supabase
          .from("candidatos")
          .update({
            sexo: l.sexo,
            data_nascimento: l.data_nascimento,
            demografia_origem: "bi-ocr",
            demografia_lida_em: agora.toISOString(),
          })
          .eq("id", l.id)
      )
    );
    lidos += lote.length;
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/admin");

  const partes = [`${lidos} ficha(s) actualizada(s)`];
  if (semDados) partes.push(`${semDados} com BI lido mas sem os dados escritos`);
  if (semBi) partes.push(`${semBi} ainda sem o BI passado por OCR`);
  if (preservados) partes.push(`${preservados} com correcção manual, deixadas como estão`);

  return { ok: true, lidos, semDados, semBi, preservados, mensagem: partes.join(" · ") };
}

/* ═══════════════════════════ CORRECÇÃO À MÃO ═══════════════════════════ */

export async function corrigirDemografia(
  candidatoId: string,
  sexo: "M" | "F" | null,
  nascimento: string | null
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    await exigir("editar_candidatura");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  if (sexo !== null && sexo !== "M" && sexo !== "F") {
    return { ok: false, mensagem: "O sexo só pode ficar em branco, M ou F." };
  }

  if (nascimento) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) {
      return { ok: false, mensagem: "A data de nascimento tem de ser uma data válida." };
    }
    const d = new Date(`${nascimento}T00:00:00Z`);
    const anos = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (Number.isNaN(d.getTime()) || anos < 14 || anos > 80) {
      return { ok: false, mensagem: "Essa data de nascimento não é plausível para um candidato." };
    }
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("candidatos")
    .update({
      sexo,
      data_nascimento: nascimento,
      // Marcar como manual é o que impede a leitura automática de voltar a
      // escrever por cima na próxima passagem.
      demografia_origem: "manual",
      demografia_lida_em: new Date().toISOString(),
    })
    .eq("id", candidatoId);

  if (error) return { ok: false, mensagem: error.message.slice(0, 160) };

  revalidatePath(`/admin/candidato/${candidatoId}`);
  revalidatePath("/admin/dashboard");
  return { ok: true, mensagem: "Corrigido." };
}
