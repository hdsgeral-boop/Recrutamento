"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * ===========================================================================
 * DICA - o pop-up que aparece ao passar o rato
 * ---------------------------------------------------------------------------
 * Vai para dentro do <body> por portal e posiciona-se em coordenadas fixas.
 * Sem isso, um pop-up dentro de uma tabela com overflow-x-auto ficaria
 * cortado pela própria tabela, que é exactamente onde precisamos dele.
 *
 * Abre com o rato e também com o teclado (foco), para quem navega por tab.
 * ===========================================================================
 */

const LARGURA = 300;
const MARGEM = 10;

export function Dica({
  children,
  titulo,
  conteudo,
}: {
  children: ReactNode;
  titulo?: string;
  conteudo: ReactNode;
}) {
  const [montado, setMontado] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [caixa, setCaixa] = useState({ topo: 0, esquerda: 0, porCima: false });
  const alvo = useRef<HTMLSpanElement>(null);

  useEffect(() => setMontado(true), []);

  const posicionar = useCallback(() => {
    const r = alvo.current?.getBoundingClientRect();
    if (!r) return;

    // Se não couber por baixo, abre por cima. Numa tabela longa, as últimas
    // linhas estão sempre coladas ao fundo do ecrã.
    const porCima = r.bottom + 170 > window.innerHeight && r.top > 180;

    const meio = r.left + r.width / 2;
    const esquerda = Math.min(
      Math.max(meio - LARGURA / 2, MARGEM),
      window.innerWidth - LARGURA - MARGEM
    );

    setCaixa({ topo: porCima ? r.top - 8 : r.bottom + 8, esquerda, porCima });
    setAberto(true);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const fechar = () => setAberto(false);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto]);

  return (
    <>
      <span
        ref={alvo}
        tabIndex={0}
        role="button"
        aria-label={titulo ?? "Ver detalhe"}
        className="inline-flex cursor-help outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        onMouseEnter={posicionar}
        onMouseLeave={() => setAberto(false)}
        onFocus={posicionar}
        onBlur={() => setAberto(false)}
      >
        {children}
      </span>

      {montado &&
        aberto &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: caixa.topo,
              left: caixa.esquerda,
              width: LARGURA,
              transform: caixa.porCima ? "translateY(-100%)" : undefined,
              zIndex: 90,
            }}
            className="pointer-events-none rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs leading-relaxed text-slate-100 shadow-xl"
          >
            {titulo && <p className="mb-1.5 font-semibold text-white">{titulo}</p>}
            {conteudo}
          </div>,
          document.body
        )}
    </>
  );
}
