"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { normalizarSlug } from "@/lib/concurso-contexto";
import { criarNovoConcurso } from "@/app/admin/accoes-concursos";

interface CriterioRubrica {
  chave: string;
  titulo: string;
  peso: number;
  descricao: string;
}

interface PerguntaEntrevista {
  codigo: string;
  bloco: "tecnica" | "comportamental";
  pergunta: string;
  procurar: string;
  peso: number;
}

const CRITERIOS_INICIAIS: CriterioRubrica[] = [
  {
    chave: "formacao",
    titulo: "Formação Académica e Qualificações",
    peso: 25,
    descricao: "Nível de escolaridade e curso na área da função.",
  },
  {
    chave: "experiencia",
    titulo: "Experiência Prática Comprovada",
    peso: 35,
    descricao: "Anos de experiência similar e comprovativos de trabalho.",
  },
  {
    chave: "competencias",
    titulo: "Competências Técnicas / Habilitações",
    peso: 25,
    descricao: "Cartas de condução, ferramentas ou certificações específicas.",
  },
  {
    chave: "completude",
    titulo: "Completude Documental e Veracidade",
    peso: 15,
    descricao: "Entrega legível de CV, BI e certificados válidos.",
  },
];

const PERGUNTAS_INICIAIS: PerguntaEntrevista[] = [
  {
    codigo: "P1",
    bloco: "tecnica",
    pergunta: "Descreva a sua experiência prática na função e os principais desafios.",
    procurar: "Rigor técnico, métodos de execução e autonomia.",
    peso: 25,
  },
  {
    codigo: "P2",
    bloco: "tecnica",
    pergunta: "Que ferramentas, sistemas ou equipamentos domina no seu dia-a-dia?",
    procurar: "Segurança de trabalho e ferramentas actuais.",
    peso: 25,
  },
  {
    codigo: "P3",
    bloco: "comportamental",
    pergunta: "Como reage quando surgem imprevistos ou prazos muito apertados?",
    procurar: "Resiliência, sentido de responsabilidade e calma.",
    peso: 25,
  },
  {
    codigo: "P4",
    bloco: "comportamental",
    pergunta: "Dê um exemplo de trabalho em equipa com sucesso para resolver um problema.",
    procurar: "Comunicação aberta e espírito colaborativo.",
    peso: 25,
  },
];

export function ModalNovoConcurso({
  rubricas,
}: {
  rubricas: { versao: string; nome: string; totalMaximo: number }[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [aGravar, startTransition] = useTransition();

  // Etapa 1: Dados Gerais
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [vagaTitulo, setVagaTitulo] = useState("");
  const [vagaDescricao, setVagaDescricao] = useState("");
  const [vagasPrevistas, setVagasPrevistas] = useState(10);
  const [prazo, setPrazo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [rubricaVersao, setRubricaVersao] = useState(rubricas[0]?.versao || "padrao-v1");

  // Etapa 2: Rúbrica e Entrevistas
  const [modalidade, setModalidade] = useState<"chamada" | "videochamada" | "presencial">("videochamada");
  const [criterios, setCriterios] = useState<CriterioRubrica[]>(CRITERIOS_INICIAIS);
  const [perguntas, setPerguntas] = useState<PerguntaEntrevista[]>(PERGUNTAS_INICIAIS);

  const totalPontosRubrica = criterios.reduce((acc, c) => acc + (Number(c.peso) || 0), 0);
  const totalPontosEntrevista = perguntas.reduce((acc, p) => acc + (Number(p.peso) || 0), 0);

  function aoMudarNome(v: string) {
    setNome(v);
    setSlug(normalizarSlug(v));
  }

  function avancarParaEtapa2(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Preenche o nome do concurso.");
      return;
    }
    if (!vagaTitulo.trim()) {
      toast.error("Preenche o título da vaga.");
      return;
    }
    setEtapa(2);
  }

  function adicionarCriterio() {
    const num = criterios.length + 1;
    setCriterios([
      ...criterios,
      {
        chave: `crit_${num}`,
        titulo: `Novo Critério ${num}`,
        peso: 10,
        descricao: "Descrição do que é pontuado neste critério.",
      },
    ]);
  }

  function removerCriterio(index: number) {
    if (criterios.length <= 1) return;
    setCriterios(criterios.filter((_, i) => i !== index));
  }

  function actualizarCriterio(index: number, campo: keyof CriterioRubrica, valor: unknown) {
    const novos = [...criterios];
    novos[index] = { ...novos[index], [campo]: valor };
    setCriterios(novos);
  }

  function adicionarPergunta() {
    const num = perguntas.length + 1;
    setPerguntas([
      ...perguntas,
      {
        codigo: `P${num}`,
        bloco: num % 2 === 0 ? "comportamental" : "tecnica",
        pergunta: "Nova pergunta da entrevista...",
        procurar: "O que o entrevistador deve avaliar na resposta.",
        peso: 10,
      },
    ]);
  }

  function removerPergunta(index: number) {
    if (perguntas.length <= 1) return;
    setPerguntas(perguntas.filter((_, i) => i !== index));
  }

  function actualizarPergunta(index: number, campo: keyof PerguntaEntrevista, valor: unknown) {
    const novos = [...perguntas];
    novos[index] = { ...novos[index], [campo]: valor };
    setPerguntas(novos);
  }

  async function submeterFinal() {
    if (totalPontosRubrica !== 100) {
      toast.warning(`A soma da rúbrica dá ${totalPontosRubrica} pontos (deve somar 100).`);
    }

    if (totalPontosEntrevista !== 100) {
      toast.warning(`A soma das perguntas da entrevista dá ${totalPontosEntrevista} pontos (deve somar 100).`);
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
        rubricaConfig: {
          nome: `Rúbrica - ${nome.trim()}`,
          totalMaximo: 100,
          criterios,
        },
        roteiroConfig: {
          modalidade,
          perguntas,
        },
      });

      if (res.ok) {
        toast.success(`Concurso "${nome}" criado com sucesso com a sua rúbrica e roteiro!`);
        setAberto(false);
        setEtapa(1);
        setNome("");
        setSlug("");
        setVagaTitulo("");
        setVagaDescricao("");
        setCriterios(CRITERIOS_INICIAIS);
        setPerguntas(PERGUNTAS_INICIAIS);
        router.refresh();
      } else {
        toast.error("Não foi possível criar o concurso", { description: res.mensagem });
      }
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) setEtapa(1);
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2 bg-consulvolt-vermelho hover:bg-consulvolt-vermelho/90">
          <Plus className="h-4 w-4" />
          <span>Novo Concurso</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-consulvolt-amarelo" />
              <span>Criar Novo Concurso</span>
            </DialogTitle>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant={etapa === 1 ? "default" : "secondary"} className="h-6">
                1. Dados Gerais
              </Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant={etapa === 2 ? "default" : "outline"} className="h-6">
                2. Rúbrica & Entrevista
              </Badge>
            </div>
          </div>
          <DialogDescription>
            {etapa === 1
              ? "Informações essenciais da vaga, prazos e metas do projecto."
              : "Configuração isolada das perguntas de triagem e modalidade da entrevista para este concurso."}
          </DialogDescription>
        </DialogHeader>

        {/* ETAPA 1 */}
        {etapa === 1 && (
          <form onSubmit={avancarParaEtapa2} className="space-y-4 py-2">
            <div>
              <Label htmlFor="nome">Nome do Concurso *</Label>
              <Input
                id="nome"
                required
                placeholder="Ex.: Recrutamento Técnico EPAL 2027"
                value={nome}
                onChange={(e) => aoMudarNome(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="slug">Slug / Subdomínio *</Label>
                <Input
                  id="slug"
                  required
                  placeholder="epal-2027"
                  value={slug}
                  onChange={(e) => setSlug(normalizarSlug(e.target.value))}
                  className="mt-1 font-mono text-xs"
                />
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {slug || "slug"}.recrutar.co.ao
                </p>
              </div>

              <div>
                <Label htmlFor="vagaTitulo">Título da Vaga *</Label>
                <Input
                  id="vagaTitulo"
                  required
                  placeholder="Ex.: Técnico Electricista de Campo"
                  value={vagaTitulo}
                  onChange={(e) => setVagaTitulo(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="vagaDescricao">Descrição da Oportunidade</Label>
              <Textarea
                id="vagaDescricao"
                rows={2}
                placeholder="Descreve os objectivos e perfil pretendido para os candidatos..."
                value={vagaDescricao}
                onChange={(e) => setVagaDescricao(e.target.value)}
                className="mt-1 resize-none text-xs"
              />
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

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="gap-2 bg-consulvolt-vermelho hover:bg-consulvolt-vermelho/90">
                <span>Avançar para Etapa 2: Rúbrica & Entrevista</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* ETAPA 2 */}
        {etapa === 2 && (
          <div className="space-y-6 py-2">
            {/* Secção 1: Modalidade */}
            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <Video className="h-4 w-4 text-consulvolt-vermelho" />
                <span>Modalidade Padrão de Entrevista</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Define como as entrevistas deste concurso serão conduzidas por padrão.
              </p>
              <div className="mt-3">
                <Select
                  value={modalidade}
                  onValueChange={(v) => setModalidade(v as "chamada" | "videochamada" | "presencial")}
                >
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue placeholder="Escolhe a modalidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="videochamada">
                      Videoconferência (Google Meet integrado)
                    </SelectItem>
                    <SelectItem value="chamada">
                      Chamada telefónica directa
                    </SelectItem>
                    <SelectItem value="presencial">
                      Entrevista Presencial
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Secção 2: Rúbrica de Triagem Configurável */}
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <FileText className="h-4 w-4 text-consulvolt-vermelho" />
                    <span>Rúbrica de Triagem (Critérios e Pontuações)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Perguntas e ponderação de documentos para classificação automática (Meta: 100 pts).
                  </p>
                </div>
                <Badge
                  variant={totalPontosRubrica === 100 ? "default" : "destructive"}
                  className="font-mono text-xs"
                >
                  {totalPontosRubrica} / 100 pts
                </Badge>
              </div>

              <div className="mt-4 space-y-3">
                {criterios.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border bg-slate-50/50 p-2.5">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex gap-2">
                        <Input
                          value={c.titulo}
                          onChange={(e) => actualizarCriterio(i, "titulo", e.target.value)}
                          placeholder="Título do critério"
                          className="h-8 text-xs font-semibold"
                        />
                        <div className="flex w-24 items-center gap-1">
                          <Input
                            type="number"
                            min="1"
                            max="100"
                            value={c.peso}
                            onChange={(e) => actualizarCriterio(i, "peso", Number(e.target.value))}
                            className="h-8 text-center text-xs font-bold"
                          />
                          <span className="text-[11px] text-muted-foreground">pts</span>
                        </div>
                      </div>
                      <Input
                        value={c.descricao}
                        onChange={(e) => actualizarCriterio(i, "descricao", e.target.value)}
                        placeholder="O que deve ser verificado..."
                        className="h-7 text-[11px] text-muted-foreground"
                      />
                    </div>
                    {criterios.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removerCriterio(i)}
                        className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={adicionarCriterio}
                  className="w-full gap-1 border-dashed text-xs text-slate-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Adicionar Critério à Rúbrica</span>
                </Button>
              </div>
            </div>

            {/* Secção 3: Roteiro de Entrevista Configurável */}
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    <HelpCircle className="h-4 w-4 text-consulvolt-vermelho" />
                    <span>Perguntas da Entrevista (Roteiro e Pontuação)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Perguntas que os avaliadores utilizarão na entrevista deste concurso.
                  </p>
                </div>
                <Badge
                  variant={totalPontosEntrevista === 100 ? "default" : "destructive"}
                  className="font-mono text-xs"
                >
                  {totalPontosEntrevista} / 100 pts
                </Badge>
              </div>

              <div className="mt-4 space-y-3">
                {perguntas.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border bg-slate-50/50 p-2.5">
                    <div className="w-10 pt-1 text-center font-mono text-xs font-bold text-slate-500">
                      {p.codigo}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="flex gap-2">
                        <Input
                          value={p.pergunta}
                          onChange={(e) => actualizarPergunta(i, "pergunta", e.target.value)}
                          placeholder="Texto da pergunta..."
                          className="h-8 text-xs"
                        />
                        <div className="flex w-24 items-center gap-1">
                          <Input
                            type="number"
                            min="1"
                            max="100"
                            value={p.peso}
                            onChange={(e) => actualizarPergunta(i, "peso", Number(e.target.value))}
                            className="h-8 text-center text-xs font-bold"
                          />
                          <span className="text-[11px] text-muted-foreground">pts</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Select
                          value={p.bloco}
                          onValueChange={(v) => actualizarPergunta(i, "bloco", v as "tecnica" | "comportamental")}
                        >
                          <SelectTrigger className="h-7 w-36 text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tecnica">Técnica</SelectItem>
                            <SelectItem value="comportamental">Comportamental</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={p.procurar}
                          onChange={(e) => actualizarPergunta(i, "procurar", e.target.value)}
                          placeholder="O que procurar na resposta..."
                          className="h-7 flex-1 text-[11px] text-muted-foreground"
                        />
                      </div>
                    </div>
                    {perguntas.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removerPergunta(i)}
                        className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={adicionarPergunta}
                  className="w-full gap-1 border-dashed text-xs text-slate-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Adicionar Pergunta à Entrevista</span>
                </Button>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setEtapa(1)} disabled={aGravar}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Voltar à Etapa 1
              </Button>
              <Button
                type="button"
                onClick={submeterFinal}
                disabled={aGravar}
                className="gap-2 bg-consulvolt-vermelho hover:bg-consulvolt-vermelho/90"
              >
                {aGravar ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>A Criar Concurso...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Criar Concurso com Rúbrica e Entrevista</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
