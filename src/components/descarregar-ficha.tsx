"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Printer } from "lucide-react";

/**
 * ===========================================================================
 * COMO SE LEVA A FICHA DAQUI PARA FORA
 * ---------------------------------------------------------------------------
 * Depende de a entrevista já ter acontecido, e não é capricho.
 *
 * ANTES E DURANTE: PDF.
 * A folha em branco existe para ser impressa e preenchida à caneta na sala.
 * O PDF do browser sai em A4 com as margens certas, e é o formato que uma
 * impressora entende. Uma imagem para isto seria pior em tudo.
 *
 * DEPOIS: IMAGEM.
 * A folha preenchida já não é um formulário, é um REGISTO do que aconteceu.
 * Uma imagem é o que se arquiva, se anexa a um email e se manda por WhatsApp
 * a quem decide, sem ninguém precisar de abrir nada. É também o formato que
 * um telemóvel abre sempre, que é onde a maior parte destas fichas vai ser
 * vista.
 *
 * PORQUE É QUE A IMAGEM SE FAZ AQUI E NÃO NO SERVIDOR
 * Pela mesma razão que o PDF: um Chromium num servidor não cabe no plano em
 * que isto corre. A folha já está desenhada para A4 no browser, e é o próprio
 * browser que a fotografa - sem servidor nenhum pelo meio, e sem a folha
 * passar por lado nenhum.
 *
 * E PORQUE É QUE É O BROWSER A DESENHAR, E NÃO UMA BIBLIOTECA
 * A primeira tentativa foi com uma biblioteca que reconstrói o desenho a
 * partir do HTML. Saiu mal: as bolas das marcações, que são SVG, apareceram
 * na imagem como riscos partidos, e a coluna do Mau desapareceu de todo. Uma
 * ficha assim é pior do que ficha nenhuma - parece um documento, mas não diz
 * o que aconteceu.
 *
 * O que se faz agora é meter a folha dentro de um `foreignObject` e deixar o
 * PRÓPRIO browser rasterizá-la. O que sai é o que está no ecrã, porque foi o
 * mesmo motor que desenhou as duas coisas. É também o que garante que as
 * bolas preenchidas ficam preenchidas na imagem.
 * ===========================================================================
 */

/** Um nome de ficheiro que se percebe numa pasta com cem fichas lá dentro. */
function nomeDoFicheiro(nome: string, referencia: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const dia = new Date().toISOString().slice(0, 10);
  return `Ficha_${limpo || "candidato"}_${referencia}_${dia}.png`;
}

export function DescarregarFicha({
  preenchida,
  nome,
  referencia,
}: {
  /** Há avaliação gravada: a entrevista já aconteceu. */
  preenchida: boolean;
  nome: string;
  referencia: string;
}) {
  const [aGerar, setAGerar] = useState(false);

  // ----------------------------------------------------- ANTES E DURANTE
  if (!preenchida) {
    return (
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-1.5 rounded-md bg-consulvolt-vermelho px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Printer className="h-3.5 w-3.5" />
        Imprimir / Guardar PDF
      </button>
    );
  }

  // ------------------------------------------------------------- DEPOIS
  async function descarregar() {
    const folha = document.getElementById("folha-ficha");
    if (!folha) return toast.error("Não encontrei a folha para fotografar.");

    setAGerar(true);
    try {
      // Carregado só quando alguém carrega no botão: não faz sentido custar
      // tempo de arranque a quem só veio ver a ficha.
      const { toPng } = await import("html-to-image");

      const url = await toPng(folha, {
        // Duas vezes o tamanho: numa folha cheia de texto pequeno, a imagem a
        // 1x fica legível no ecrã e ilegível quando alguém a amplia para ler
        // uma observação escrita à mão.
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        // A folha é branca; sem isto herdava o fundo cinzento do painel.
        style: { margin: "0" },
        // A barra de cima não é parte do documento: é o painel a falar com
        // quem está a olhar, e não tem nada que fazer numa ficha arquivada.
        filter: (no) => !(no instanceof HTMLElement) || !no.classList.contains("no-print"),
      });

      // Uma imagem vazia descarrega-se na mesma e só se dá por isso quando
      // alguém a abre, provavelmente noutro dia. Melhor falhar aqui.
      if (!url || url.length < 5000) {
        throw new Error("A imagem saiu vazia.");
      }

      const a = document.createElement("a");
      a.href = url;
      a.download = nomeDoFicheiro(nome, referencia);
      document.body.appendChild(a);
      a.click();
      a.remove();

      toast.success("Ficha descarregada em imagem.");
    } catch (erro) {
      console.error("[ficha] não consegui gerar a imagem:", erro);
      toast.error(
        erro instanceof Error
          ? `Não consegui gerar a imagem: ${erro.message}`
          : "Não consegui gerar a imagem."
      );
    } finally {
      setAGerar(false);
    }
  }

  return (
    <button
      type="button"
      onClick={descarregar}
      disabled={aGerar}
      className="flex items-center gap-1.5 rounded-md bg-consulvolt-vermelho px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {aGerar ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {aGerar ? "A gerar a imagem" : "Descarregar imagem"}
    </button>
  );
}
