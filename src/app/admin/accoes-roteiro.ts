"use server";

import { revalidatePath } from "next/cache";

import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigir } from "@/lib/utilizadores";
import { lerRoteiroEmVigor } from "@/lib/entrevista/carregar-roteiro";
import {
  normalizarRoteiro,
  validarRoteiro,
  versaoSeguinte,
  type Pergunta,
} from "@/lib/entrevista/roteiro";

/**
 * ===========================================================================
 * GRAVAR O ROTEIRO
 * ---------------------------------------------------------------------------
 * Gravar NÃO edita a versão em vigor: cria uma versão nova e passa-lhe o
 * testemunho. A anterior fica na tabela, desactivada.
 *
 * É isso que mantém as avaliações antigas honestas. Cada avaliação guarda a
 * versão com que foi feita; se as perguntas mudassem por baixo, a nota de
 * quem foi entrevistado o mês passado continuava a dizer 83 mas já não
 * queria dizer a mesma coisa - e ninguém daria por isso.
 * ===========================================================================
 */

export interface ResultadoRoteiro {
  ok: boolean;
  mensagem: string;
  /** A versão que ficou em vigor, quando correu bem. */
  versao?: string;
  /** O que impediu a gravação, para o painel mostrar linha a linha. */
  erros?: string[];
}

export async function guardarRoteiro(
  perguntas: Pergunta[],
  notas: string
): Promise<ResultadoRoteiro> {
  // ------------------------------------------------------------ PERMISSÕES
  let sessao;
  try {
    sessao = await exigir("configurar");
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : "Sem permissão." };
  }

  // --------------------------------------------------------------- LIMPAR
  // Espaços a mais e códigos em minúsculas são erro de quem escreve, não
  // motivo para recusar. Normalizamos antes de validar.
  //
  // A limpeza é a mesma função que o painel usa, e parte da pergunta inteira
  // em vez de a reconstruir campo a campo. Reconstruir à mão já custou caro:
  // o `grupo` ficava de fora, e a gravação recusava um roteiro que o ecrã
  // dava por bom.
  const limpas: Pergunta[] = normalizarRoteiro(perguntas);

  const erros = validarRoteiro(limpas);
  if (erros.length > 0) {
    return { ok: false, mensagem: "O roteiro não pode ser gravado assim.", erros };
  }

  const supabase = criarClienteServidor();
  const actual = await lerRoteiroEmVigor();

  if (actual.porMigrar) {
    return {
      ok: false,
      mensagem:
        "Falta correr a migração no Supabase. Cola o ficheiro supabase/CORRER-NO-SUPABASE.sql no SQL Editor e tenta outra vez.",
    };
  }

  // Se nada mudou, não se cria versão nenhuma. Uma tabela cheia de versões
  // iguais só torna o histórico impossível de ler.
  // A comparação inclui o GRUPO. Sem ele, trocar uma pergunta de percurso -
  // que é uma mudança bem real - passava por "não havia nada para mudar" e a
  // gravação não acontecia.
  //
  // Compara-se campo a campo, e não pelo JSON das duas listas: o que vem da
  // base de dados pode trazer as chaves por outra ordem, e isso não é uma
  // diferença de conteúdo nenhuma.
  const anteriores = normalizarRoteiro(actual.perguntas);
  const igual =
    anteriores.length === limpas.length &&
    anteriores.every((p, i) => {
      const n = limpas[i];
      return (
        p.codigo === n.codigo &&
        p.bloco === n.bloco &&
        p.pergunta === n.pergunta &&
        p.procurar === n.procurar &&
        p.peso === n.peso &&
        (p.grupo ?? "ambos") === (n.grupo ?? "ambos")
      );
    });

  if (igual) return { ok: true, mensagem: "Não havia nada para mudar.", versao: actual.versao };

  // ---------------------------------------------------------- NOVA VERSÃO
  // Procura uma versão livre: se já existir ugp-e2, tenta ugp-e3, e assim por
  // diante. Sem isto, duas pessoas a gravar ao mesmo tempo chocavam na chave.
  let versao = versaoSeguinte(actual.versao);
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    const { data } = await supabase
      .from("roteiros_entrevista")
      .select("versao")
      .eq("versao", versao)
      .limit(1);

    if (!data || data.length === 0) break;
    versao = versaoSeguinte(versao);
  }

  // Desligar a activa ANTES de ligar a nova. O índice único só deixa existir
  // uma linha com activo = true, por isso a ordem não é opcional.
  const { error: erroDesligar } = await supabase
    .from("roteiros_entrevista")
    .update({ activo: false })
    .eq("activo", true);

  if (erroDesligar) return { ok: false, mensagem: erroDesligar.message };

  const { error } = await supabase.from("roteiros_entrevista").insert({
    versao,
    perguntas: limpas,
    activo: true,
    notas: notas.trim() || null,
    criado_por: sessao.utilizador,
  });

  if (error) {
    // Falhou a inserir: repomos a que estava, para não ficar o sistema sem
    // roteiro activo nenhum por causa de um engano.
    await supabase
      .from("roteiros_entrevista")
      .update({ activo: true })
      .eq("versao", actual.versao);

    return { ok: false, mensagem: error.message };
  }

  revalidatePath("/admin/definicoes");
  revalidatePath("/admin");

  return {
    ok: true,
    versao,
    mensagem: `Gravado como versão ${versao}. As entrevistas já feitas continuam com a versão ${actual.versao}.`,
  };
}
