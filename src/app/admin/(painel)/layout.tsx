import Image from "next/image";
import Link from "next/link";

import { NavPainel, type OpcaoMenu } from "@/components/nav-painel";
import { ConcursoSelector } from "@/components/concurso-selector";
import {
  listarConcursosParaAdmin,
  obterConcursoActivoSlug,
} from "@/app/admin/accoes-concursos";
import { sair } from "@/app/admin/accoes-login";
import { sessaoActual } from "@/lib/utilizadores";
import { pode, podeEntrarNasEntrevistas } from "@/lib/permissoes";
import { EMPRESA } from "@/lib/constantes";

export const metadata = { robots: { index: false, follow: false } };

/** O painel mostra sempre quem está ligado, por isso nunca é estático. */
export const dynamic = "force-dynamic";

/** Cabeçalho comum a todas as páginas do painel. */
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const [sessao, concursos, concursoActivoSlug] = await Promise.all([
    sessaoActual(),
    listarConcursosParaAdmin(),
    obterConcursoActivoSlug(),
  ]);

  const papel = sessao?.papel ?? "visualizador";
  const eRecrutador = Boolean(sessao?.eRecrutador);
  const nasEntrevistas = podeEntrarNasEntrevistas(papel, eRecrutador);
  const gereEntrevistas = pode(papel, "gerir_entrevistas");

  const concursoActivo = concursos.find((c) => c.slug === concursoActivoSlug);

  // O menu só mostra o que este papel pode abrir.
  const opcoes: OpcaoMenu[] = [
    { href: "/admin/dashboard", rotulo: "Dashboard", icone: "BarChart3" },
    { href: "/admin", rotulo: "Candidaturas", icone: "Users" },
    { href: "/admin/ranking", rotulo: "Ranking", icone: "Trophy" },
    ...(nasEntrevistas
      ? [
          {
            href: "/admin/entrevistas",
            rotulo: "Entrevistas",
            icone: "ClipboardList" as const,
            submenu: [
              {
                href: "/admin/entrevistas/agendadas",
                rotulo: "Agendadas",
                descricao: "Com recrutador e data, à espera de acontecer",
              },
              {
                href: "/admin/entrevistas/decorrer",
                rotulo: "Em entrevista",
                descricao: "Começadas e ainda por guardar",
              },
              {
                href: "/admin/entrevistas/atrasadas",
                rotulo: "Atrasadas",
                descricao: "Com data já passada, à espera de data nova",
              },
              {
                href: "/admin/entrevistas/concluidas",
                rotulo: "Concluídas",
                descricao: "Já avaliadas, com nota",
              },
              ...(gereEntrevistas
                ? [
                    {
                      href: "/admin/entrevistas/atribuicao",
                      rotulo: "Atribuição de recrutadores",
                      descricao: "Quem entrevista quem",
                    },
                    {
                      href: "/admin/entrevistas/perguntas",
                      rotulo: "Perguntas e pesos",
                      descricao: "O roteiro, por grupo de experiência",
                    },
                  ]
                : []),
              {
                href: "/admin/entrevistas/resultados",
                rotulo: "Resultados",
                descricao: "Notas lado a lado com a candidatura",
              },
            ],
          },
        ]
      : []),
    { href: "/admin/comunicacoes", rotulo: "Comunicações", icone: "MessageSquare" },
  ];

  const administracao = [
    ...(pode(papel, "configurar")
      ? [
          {
            href: "/admin/concursos",
            rotulo: "Concursos",
            descricao: "Criar e alternar concursos",
            icone: "FolderKanban" as const,
          },
          {
            href: "/admin/definicoes",
            rotulo: "Definições",
            descricao: "Prazo, vagas e roteiro",
            icone: "SlidersHorizontal" as const,
          },
        ]
      : []),
    ...(pode(papel, "gerir_utilizadores")
      ? [
          {
            href: "/admin/utilizadores",
            rotulo: "Utilizadores",
            descricao: "Contas, papéis e recrutadores",
            icone: "ShieldCheck" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="no-print sticky top-0 z-40 border-b border-white/10 bg-consulvolt-preto text-white">
        <div className="container relative flex h-16 items-center gap-3">
          <Link href="/admin" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/95 p-1 ring-1 ring-white/20 sm:h-10 sm:w-10">
              <Image
                src="/logo-consulvolt.png"
                alt="Logótipo da Consulvolt"
                width={40}
                height={40}
                priority
                className="h-full w-full object-contain"
              />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-bold tracking-widest">
                CONSUL<span className="text-consulvolt-amarelo">VOLT</span>
              </span>
              <span className="hidden truncate text-[10px] text-slate-400 sm:block">
                Recrutamento - {concursoActivo?.vagaTitulo || EMPRESA.vaga}
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <ConcursoSelector
              concursoActivoSlug={concursoActivoSlug}
              concursos={concursos}
            />

            <NavPainel
              opcoes={opcoes}
              nome={sessao?.nome || sessao?.utilizador || "Sessão"}
              papel={papel}
              eRecrutador={eRecrutador}
              administracao={administracao}
              sair={sair}
            />
          </div>
        </div>
      </header>

      <main className="container py-5 sm:py-6">{children}</main>
    </div>
  );
}
