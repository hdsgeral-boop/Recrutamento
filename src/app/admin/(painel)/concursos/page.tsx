import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  ExternalLink,
  FolderKanban,
  Layers,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listarConcursosParaAdmin,
  obterConcursoActivoSlug,
} from "@/app/admin/accoes-concursos";
import { listarRubricas } from "@/lib/ranking/registo-rubricas";
import { ModalNovoConcurso } from "@/components/modal-novo-concurso";
import { BotaoActivarConcurso } from "@/components/botao-activar-concurso";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gestão de Concursos | Consulvolt",
};

export default async function PaginaConcursos() {
  const [concursos, concursoActivoSlug] = await Promise.all([
    listarConcursosParaAdmin(),
    obterConcursoActivoSlug(),
  ]);

  const rubricas = listarRubricas();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Concursos de Recrutamento
          </h1>
          <p className="text-sm text-muted-foreground">
            Gere todos os concursos isolados da plataforma multi-tenant Consulvolt.
          </p>
        </div>

        <ModalNovoConcurso rubricas={rubricas} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {concursos.map((c) => {
          const eActivo = c.slug === concursoActivoSlug;
          return (
            <Card
              key={c.id || c.slug}
              className={`relative flex flex-col justify-between transition-shadow hover:shadow-md ${
                eActivo ? "border-consulvolt-vermelho ring-1 ring-consulvolt-vermelho/30" : ""
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base font-bold">
                      {c.nome}
                    </CardTitle>
                    <CardDescription className="truncate text-xs">
                      {c.vagaTitulo}
                    </CardDescription>
                  </div>
                  {eActivo && (
                    <Badge variant="default" className="bg-consulvolt-vermelho text-[10px]">
                      Activo
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pb-4 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">Slug:</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-medium text-slate-800">
                    {c.slug}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 border-y py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    <span><strong>{c.totalCandidatos}</strong> candidaturas</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-slate-400" />
                    <span><strong>{c.vagasPrevistas}</strong> vagas</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    Rúbrica: <strong>{c.rubricaVersao || "padrao-v1"}</strong>
                  </p>
                  {c.prazoCandidaturas && (
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Prazo: {new Date(c.prazoCandidaturas).toLocaleDateString("pt-PT")}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  {!eActivo ? (
                    <BotaoActivarConcurso slug={c.slug} nome={c.nome} />
                  ) : (
                    <div className="flex flex-1 items-center gap-1 text-xs font-semibold text-consulvolt-vermelho">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>A gerir este concurso</span>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="h-8 gap-1 text-xs"
                  >
                    <a
                      href={`/app?concurso=${c.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir formulário público"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
