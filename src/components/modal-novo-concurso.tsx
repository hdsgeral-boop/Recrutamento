"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizarSlug } from "@/lib/concurso-contexto";
import { criarNovoConcurso } from "@/app/admin/accoes-concursos";

export function ModalNovoConcurso({
  rubricas,
}: {
  rubricas: { versao: string; nome: string; totalMaximo: number }[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aGravar, startTransition] = useTransition();

  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [vagaTitulo, setVagaTitulo] = useState("");
  const [vagaDescricao, setVagaDescricao] = useState("");
  const [vagasPrevistas, setVagasPrevistas] = useState(30);
  const [prazo, setPrazo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [rubricaVersao, setRubricaVersao] = useState(rubricas[0]?.versao || "padrao-v1");
  const [modalidade, setModalidade] = useState<"chamada" | "videochamada" | "presencial">("chamada");

  function aoMudarNome(v: string) {
    setNome(v);
    // Gerar slug automaticamente se o utilizador ainda não o tiver personalizado
    setSlug(normalizarSlug(v));
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();

    if (!nome.trim()) {
      toast.error("Preenche o nome do concurso.");
      return;
    }

    if (!vagaTitulo.trim()) {
      toast.error("Preenche o título da vaga.");
      return;
    }

    startTransition(async () => {
      const res = await criarNovoConcurso({
        nome: nome.trim(),
        slug: slug.trim() || normalizarSlug(nome),
        vagaTitulo: vagaTitulo.trim(),
        vagaDescricao: vagaDescricao.trim() || undefined,
        vagasPrevistas: Number(vagasPrevistas) || 10,
        prazoCandidaturas: new Date(`${prazo}T23:59:59Z`).toISOString(),
        rubricaVersao,
        modalidadePadrao: modalidade,
      });

      if (res.ok) {
        toast.success(`Concurso "${nome}" criado com sucesso!`);
        setAberto(false);
        setNome("");
        setSlug("");
        setVagaTitulo("");
        setVagaDescricao("");
        router.refresh();
      } else {
        toast.error("Não foi possível criar o concurso", { description: res.mensagem });
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-consulvolt-vermelho hover:bg-consulvolt-vermelho/90">
          <Plus className="h-4 w-4" />
          <span>Novo Concurso</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <form onSubmit={submeter} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-consulvolt-amarelo" />
              Criar Novo Concurso
            </DialogTitle>
            <DialogDescription>
              Configura um novo processo de recrutamento multi-tenant com subdomínio, formulário e isolamento próprio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div>
              <Label htmlFor="nome">Nome do Concurso *</Label>
              <Input
                id="nome"
                required
                placeholder="Ex.: Técnico de Redes EPAL 2027"
                value={nome}
                onChange={(e) => aoMudarNome(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="slug">Slug (Subdomínio) *</Label>
                <Input
                  id="slug"
                  required
                  placeholder="epal-2027"
                  value={slug}
                  onChange={(e) => setSlug(normalizarSlug(e.target.value))}
                  className="mt-1 font-mono text-xs"
                />
                <p className="mt-0.5 text-[11px] text-muted-foreground">{slug || "slug"}.recrutar.co.ao</p>
              </div>

              <div>
                <Label htmlFor="vagaTitulo">Título da Vaga *</Label>
                <Input
                  id="vagaTitulo"
                  required
                  placeholder="Ex.: Técnico Electricista"
                  value={vagaTitulo}
                  onChange={(e) => setVagaTitulo(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vagasPrevistas">Vagas Previstas *</Label>
                <Input
                  id="vagasPrevistas"
                  type="number"
                  min="1"
                  required
                  value={vagasPrevistas}
                  onChange={(e) => setVagasPrevistas(Number(e.target.value))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="prazo">Prazo de Candidatura *</Label>
                <Input
                  id="prazo"
                  type="date"
                  required
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rubrica">Rúbrica de Avaliação *</Label>
                <Select value={rubricaVersao} onValueChange={setRubricaVersao}>
                  <SelectTrigger id="rubrica" className="mt-1">
                    <SelectValue placeholder="Escolhe a rúbrica" />
                  </SelectTrigger>
                  <SelectContent>
                    {rubricas.map((r) => (
                      <SelectItem key={r.versao} value={r.versao}>
                        {r.nome} ({r.totalMaximo} pts)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="modalidade">Modalidade de Entrevista</Label>
                <Select
                  value={modalidade}
                  onValueChange={(v) => setModalidade(v as "chamada" | "videochamada" | "presencial")}
                >
                  <SelectTrigger id="modalidade" className="mt-1">
                    <SelectValue placeholder="Modalidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chamada">Chamada telefónica</SelectItem>
                    <SelectItem value="videochamada">Videoconferência (Meet)</SelectItem>
                    <SelectItem value="presencial">Presencial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAberto(false)}
              disabled={aGravar}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={aGravar}
              className="gap-2 bg-consulvolt-vermelho hover:bg-consulvolt-vermelho/90"
            >
              {aGravar && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Gravar Concurso</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
