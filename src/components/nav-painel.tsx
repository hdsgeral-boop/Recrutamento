"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  FolderKanban,
  KeyRound,
  ListChecks,
  LogOut,
  Menu,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
  User,
  UserCog,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { DEFINICOES, type Papel } from "@/lib/permissoes";

/**
 * ===========================================================================
 * NAVEGAÇÃO DO PAINEL
 * ---------------------------------------------------------------------------
 * Em ecrã largo, as opções ficam à vista e as que têm submenu abrem ao passar
 * o rato. Em ecrã estreito, tudo passa para um menu em hambúrguer onde os
 * submenus se abrem e fecham ao toque.
 *
 * PORQUE É QUE O SUBMENU NÃO DEPENDE SÓ DO RATO
 * Num telemóvel não há "passar o rato": um menu que só abre com hover fica
 * inalcançável. Por isso o mesmo submenu responde às duas coisas - hover no
 * desktop, clique em qualquer sítio - e o clique também serve a quem navega
 * por teclado.
 *
 * PORQUE É QUE O FECHO TEM ATRASO
 * Entre o botão e o painel do submenu há um salto de alguns pixels. Fechar no
 * instante em que o rato sai do botão fazia o menu fugir a meio caminho. Um
 * atraso curto dá tempo a atravessar, e cancela-se assim que o rato chega ao
 * painel.
 * ===========================================================================
 */

const ICONES = {
  Users,
  Trophy,
  BarChart3,
  MessageSquare,
  SlidersHorizontal,
  ShieldCheck,
  UserCog,
  ClipboardList,
  ListChecks,
  UserPlus,
  FolderKanban,
} as const;

export interface OpcaoMenu {
  href: string;
  rotulo: string;
  icone: keyof typeof ICONES;
  /** Quando existe, esta opção abre um submenu. */
  submenu?: { href: string; rotulo: string; descricao?: string }[];
}

/** Milissegundos que o submenu espera antes de fechar, ao sair com o rato. */
const ATRASO_FECHO = 180;

export interface OpcaoAdmin {
  href: string;
  rotulo: string;
  descricao: string;
  icone: keyof typeof ICONES;
}

export function NavPainel({
  opcoes,
  nome,
  papel,
  eRecrutador,
  administracao,
  sair,
}: {
  opcoes: OpcaoMenu[];
  nome: string;
  papel: Papel;
  eRecrutador: boolean;
  /** Definições e Utilizadores, quando este papel os pode abrir. */
  administracao: OpcaoAdmin[];
  sair: () => Promise<void>;
}) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  /** href da opção cujo submenu está aberto em ecrã largo. */
  const [submenu, setSubmenu] = useState<string | null>(null);
  /** href da opção expandida dentro do hambúrguer. */
  const [expandido, setExpandido] = useState<string | null>(null);
  const [conta, setConta] = useState(false);

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fecharTudo = () => {
    setSubmenu(null);
    setConta(false);
  };

  // Mudar de página fecha tudo, senão fica um painel aberto por cima do novo
  // conteúdo.
  useEffect(() => {
    setAberto(false);
    fecharTudo();
    setExpandido(null);
  }, [caminho]);

  useEffect(() => {
    const comEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAberto(false);
      fecharTudo();
    };
    window.addEventListener("keydown", comEscape);
    return () => window.removeEventListener("keydown", comEscape);
  }, []);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const adiarFecho = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(fecharTudo, ATRASO_FECHO);
  };

  const cancelarFecho = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  };

  const activo = (href: string) =>
    href === "/admin" ? caminho === "/admin" : caminho.startsWith(href);

  const activoComSubmenu = (o: OpcaoMenu) =>
    activo(o.href) || (o.submenu ?? []).some((s) => caminho.startsWith(s.href));

  // ---------------------------------------------------------------------------
  return (
    <>
      {/* ================================================= ECRÃ LARGO ====== */}
      <nav className="ml-auto hidden items-center gap-0.5 xl:flex">
        {opcoes.map((o) => {
          const Icone = ICONES[o.icone];
          const temSubmenu = Boolean(o.submenu?.length);
          const estaAberto = submenu === o.href;

          if (!temSubmenu) {
            return (
              <Link
                key={o.href}
                href={o.href}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  activo(o.href)
                    ? "bg-white/15 text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icone className="h-4 w-4 shrink-0" />
                {o.rotulo}
              </Link>
            );
          }

          return (
            <div
              key={o.href}
              className="relative"
              onMouseEnter={() => {
                cancelarFecho();
                setSubmenu(o.href);
                setConta(false);
              }}
              onMouseLeave={adiarFecho}
            >
              <button
                type="button"
                aria-expanded={estaAberto}
                aria-haspopup="true"
                onClick={() => setSubmenu(estaAberto ? null : o.href)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  activoComSubmenu(o) || estaAberto
                    ? "bg-white/15 text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icone className="h-4 w-4 shrink-0" />
                {o.rotulo}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    estaAberto && "rotate-180"
                  )}
                />
              </button>

              {estaAberto && (
                <div
                  onMouseEnter={cancelarFecho}
                  onMouseLeave={adiarFecho}
                  className="absolute left-0 top-full z-50 mt-1 w-[272px] overflow-hidden rounded-xl border border-white/10 bg-consulvolt-preto p-1.5 shadow-2xl"
                >
                  {o.submenu!.map((s) => (
                    <Link
                      key={s.href}
                      href={s.href}
                      className={cn(
                        "block rounded-lg px-3 py-2 transition-colors",
                        caminho === s.href || caminho.startsWith(s.href + "/")
                          ? "bg-white/15"
                          : "hover:bg-white/10"
                      )}
                    >
                      <span className="block text-sm font-medium text-white">{s.rotulo}</span>
                      {s.descricao && (
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
                          {s.descricao}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ------------------------------------------- O BOTÃO DO UTILIZADOR - */}
      <div
        className="relative hidden items-center border-l border-white/15 pl-2 xl:flex"
        onMouseEnter={() => {
          cancelarFecho();
          setConta(true);
          setSubmenu(null);
        }}
        onMouseLeave={adiarFecho}
      >
        <button
          type="button"
          aria-expanded={conta}
          aria-haspopup="true"
          onClick={() => setConta((v) => !v)}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
            conta ? "bg-white/15" : "hover:bg-white/10"
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white ring-1 ring-white/20">
            {iniciais(nome)}
          </span>
          <span className="max-w-[140px] text-right leading-tight">
            <span className="block truncate text-sm font-medium text-white">{nome}</span>
            <span className="block text-[10px] uppercase tracking-wide text-slate-400">
              {DEFINICOES[papel].rotulo}
              {eRecrutador && " · Recrutador"}
            </span>
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform", conta && "rotate-180")}
          />
        </button>

        {conta && (
          <div
            onMouseEnter={cancelarFecho}
            onMouseLeave={adiarFecho}
            className="absolute right-0 top-full z-50 mt-1 w-[248px] overflow-hidden rounded-xl border border-white/10 bg-consulvolt-preto shadow-2xl"
          >
            <div className="border-b border-white/10 px-3.5 py-3">
              <p className="truncate text-sm font-semibold text-white">{nome}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {DEFINICOES[papel].rotulo}
                {eRecrutador && " · Recrutador"}
              </p>
            </div>

            <div className="p-1.5">
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                A minha conta
              </p>
              <ItemConta href="/admin/perfil" icone={User} rotulo="Os meus dados" />
              <ItemConta
                href="/admin/trocar-palavra-passe"
                icone={KeyRound}
                rotulo="Segurança"
                descricao="Mudar a palavra-passe"
              />
            </div>

            {administracao.length > 0 && (
              <div className="border-t border-white/10 p-1.5">
                <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Administração
                </p>
                {administracao.map((a) => (
                  <ItemConta
                    key={a.href}
                    href={a.href}
                    icone={ICONES[a.icone]}
                    rotulo={a.rotulo}
                    descricao={a.descricao}
                  />
                ))}
              </div>
            )}

            <form action={sair} className="border-t border-white/10 p-1.5">
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Terminar sessão
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ================================================= HAMBÚRGUER ====== */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls="menu-painel"
        aria-label={aberto ? "Fechar menu" : "Abrir menu"}
        className="ml-auto flex items-center gap-2 rounded-md px-2.5 py-2 text-slate-200 transition-colors hover:bg-white/10 xl:hidden"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold ring-1 ring-white/20">
          {iniciais(nome)}
        </span>
        {aberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {aberto && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setAberto(false)}
            className="fixed inset-0 top-16 z-30 cursor-default bg-black/40 xl:hidden"
          />

          <div
            id="menu-painel"
            className="absolute inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-white/10 bg-consulvolt-preto shadow-xl xl:hidden"
          >
            <div className="container space-y-1 py-3">
              {/* ----------------------------------------- CONTA, NO TOPO - */}
              <div className="mb-2 rounded-lg bg-white/5 p-1.5">
                <div className="flex items-center gap-2.5 px-2 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white ring-1 ring-white/20">
                    {iniciais(nome)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{nome}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">
                      {DEFINICOES[papel].rotulo}
                      {eRecrutador && " · Recrutador"}
                    </p>
                  </div>
                </div>

                <Link
                  href="/admin/perfil"
                  className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <User className="h-4 w-4 shrink-0" />
                  Os meus dados
                </Link>
                <Link
                  href="/admin/trocar-palavra-passe"
                  className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <KeyRound className="h-4 w-4 shrink-0" />
                  Segurança
                </Link>

                {administracao.length > 0 && (
                  <>
                    <p className="border-t border-white/10 px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Administração
                    </p>
                    {administracao.map((a) => {
                      const Icone = ICONES[a.icone];
                      return (
                        <Link
                          key={a.href}
                          href={a.href}
                          className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <Icone className="h-4 w-4 shrink-0" />
                          {a.rotulo}
                        </Link>
                      );
                    })}
                  </>
                )}
              </div>

              {/* ------------------------------------------- AS OPÇÕES ---- */}
              {opcoes.map((o) => {
                const Icone = ICONES[o.icone];
                const temSubmenu = Boolean(o.submenu?.length);
                const estaExpandido = expandido === o.href;

                if (!temSubmenu) {
                  return (
                    <Link
                      key={o.href}
                      href={o.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                        activo(o.href)
                          ? "bg-white/15 text-white"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Icone className="h-4 w-4 shrink-0" />
                      {o.rotulo}
                    </Link>
                  );
                }

                return (
                  <div key={o.href}>
                    <button
                      type="button"
                      aria-expanded={estaExpandido}
                      onClick={() => setExpandido(estaExpandido ? null : o.href)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                        activoComSubmenu(o)
                          ? "bg-white/15 text-white"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Icone className="h-4 w-4 shrink-0" />
                      {o.rotulo}
                      <ChevronDown
                        className={cn(
                          "ml-auto h-4 w-4 shrink-0 transition-transform",
                          estaExpandido && "rotate-180"
                        )}
                      />
                    </button>

                    {estaExpandido && (
                      <div className="mb-1 ml-3 space-y-0.5 border-l border-white/10 pl-3 pt-1">
                        <Link
                          href={o.href}
                          className="block rounded-md px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          Visão geral
                        </Link>
                        {o.submenu!.map((s) => (
                          <Link
                            key={s.href}
                            href={s.href}
                            className={cn(
                              "block rounded-md px-3 py-2.5 text-sm transition-colors",
                              caminho.startsWith(s.href)
                                ? "bg-white/15 text-white"
                                : "text-slate-300 hover:bg-white/10 hover:text-white"
                            )}
                          >
                            {s.rotulo}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <form action={sair} className="border-t border-white/10 pt-2">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Terminar sessão
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function ItemConta({
  href,
  icone: Icone,
  rotulo,
  descricao,
}: {
  href: string;
  icone: (typeof ICONES)[keyof typeof ICONES];
  rotulo: string;
  descricao?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-white/10"
    >
      <Icone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">{rotulo}</span>
        {descricao && <span className="block text-[11px] text-slate-400">{descricao}</span>}
      </span>
    </Link>
  );
}

/** Duas letras para o avatar. Primeiro e último nome, quando há dois. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
