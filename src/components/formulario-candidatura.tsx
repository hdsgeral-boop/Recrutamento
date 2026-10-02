"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertTriangle, ClipboardList, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CampoFicheiro } from "@/components/campo-ficheiro";
import { cn } from "@/lib/utils";

import { criarClienteBrowser } from "@/lib/supabase/cliente";
import { esquemaCandidatura, limparNomeFicheiro, type DadosCandidatura } from "@/lib/validacoes";
import { submeterCandidatura, verificarDuplicado } from "@/app/app/accoes";
import type { CampoFormulario } from "@/types/formulario";
import {
  ATRIBUICOES,
  BUCKET,
  CONDICOES_TRABALHO,
  MUNICIPIOS_POR_PROVINCIA,
  NIVEIS_ACADEMICOS,
  PROVINCIAS,
  TAMANHO_MAXIMO_KB,
  type Provincia,
} from "@/lib/constantes";

type ChaveDoc = "cv" | "bi" | "certificado" | "experiencia";

const DOCS: { chave: ChaveDoc; etiqueta: string; descricao: string }[] = [
  { chave: "cv", etiqueta: "Curriculum Vitae", descricao: "CV actualizado, PDF ou imagem" },
  { chave: "bi", etiqueta: "Bilhete de Identidade", descricao: "Cópia legível do BI" },
  {
    chave: "certificado",
    etiqueta: "Certificado de Habilitações",
    descricao: "Certificado ou declaração da escola",
  },
];

/** Pergunta de Sim/Não em botões de rádio. */
function PerguntaSimNao({
  nome,
  pergunta,
  ajuda,
  valor,
  aoMudar,
  erro,
  desactivado,
}: {
  nome: string;
  pergunta: string;
  ajuda?: string;
  valor: string | undefined;
  aoMudar: (v: string) => void;
  erro?: string;
  desactivado?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-sm font-medium">
        {pergunta} <span className="text-consulvolt-vermelho">*</span>
      </p>
      {ajuda && <p className="mt-0.5 text-xs text-muted-foreground">{ajuda}</p>}

      <RadioGroup
        className="mt-2 flex gap-5"
        value={valor}
        onValueChange={aoMudar}
        disabled={desactivado}
      >
        {[
          { v: "sim", t: "Sim" },
          { v: "nao", t: "Não" },
        ].map((o) => (
          <div key={o.v} className="flex items-center gap-2">
            <RadioGroupItem id={`${nome}-${o.v}`} value={o.v} />
            <Label htmlFor={`${nome}-${o.v}`} className="cursor-pointer">
              {o.t}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {erro && <p className="mt-1 text-xs font-medium text-rose-600">{erro}</p>}
    </div>
  );
}

export interface PropsFormularioCandidatura {
  concursoSlug?: string;
  vagaTitulo?: string;
  vagaDescricao?: string | null;
  camposDinamicos?: CampoFormulario[];
}

export function FormularioCandidatura({
  concursoSlug,
  vagaTitulo,
  vagaDescricao,
  camposDinamicos = [],
}: PropsFormularioCandidatura = {}) {
  const router = useRouter();
  const supabase = useMemo(() => criarClienteBrowser(), []);

  const [ficheiros, setFicheiros] = useState<Record<ChaveDoc, File | null>>({
    cv: null,
    bi: null,
    certificado: null,
    experiencia: null,
  });
  const [errosFicheiro, setErrosFicheiro] = useState<Partial<Record<ChaveDoc, string>>>({});
  const [aEnviar, setAEnviar] = useState(false);
  const [etapa, setEtapa] = useState("");

  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DadosCandidatura>({
    resolver: zodResolver(esquemaCandidatura),
    mode: "onBlur",
    defaultValues: { curso: "" },
  });

  // Os municípios mostrados dependem da província escolhida.
  const provincia = watch("provincia") as Provincia | undefined;
  const municipiosDisponiveis = provincia ? MUNICIPIOS_POR_PROVINCIA[provincia] : [];

  // O anexo comprovativo só existe para quem diz que tem experiência.
  const temExperiencia = watch("experiencia_similar") === "sim";

  /** Verifica no servidor se o BI ou o email já foram usados. */
  async function conferirDuplicado(campo: "bi" | "email", valor: string) {
    if (!valor || valor.trim().length < 5) return;
    const { existe } = await verificarDuplicado(campo, valor);
    if (existe) {
      setError(campo, {
        message:
          campo === "bi"
            ? "Já existe uma candidatura com este número de BI."
            : "Já existe uma candidatura com este email.",
      });
    }
  }

  /** Envia um documento para o Supabase Storage e devolve o caminho gravado. */
  async function enviarDocumento(chave: ChaveDoc, ficheiro: File, pasta: string): Promise<string> {
    const extensao = ficheiro.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const caminho = `${pasta}/${chave}-${Date.now()}.${extensao}`;

    const { error } = await supabase.storage.from(BUCKET).upload(caminho, ficheiro, {
      contentType: ficheiro.type,
      upsert: false,
      cacheControl: "3600",
    });

    if (error) throw new Error(`Falha ao enviar o ${chave.toUpperCase()}: ${error.message}`);
    return caminho;
  }

  async function aoSubmeter(dados: DadosCandidatura) {
    // 1) Os três documentos são obrigatórios.
    const emFalta: Partial<Record<ChaveDoc, string>> = {};
    for (const doc of DOCS) {
      if (!ficheiros[doc.chave]) emFalta[doc.chave] = `Anexa o documento: ${doc.etiqueta}.`;
    }
    // Quem diz que tem experiência tem de a comprovar.
    if (dados.experiencia_similar === "sim" && !ficheiros.experiencia) {
      emFalta.experiencia = "Anexa o comprovativo da experiência.";
    }

    setErrosFicheiro(emFalta);

    if (Object.keys(emFalta).length > 0) {
      toast.error("Faltam documentos", {
        description: "Confere os anexos assinalados a vermelho.",
      });
      return;
    }

    setAEnviar(true);

    try {
      // 2) Envio dos documentos directamente para o Storage.
      const pasta = `${limparNomeFicheiro(dados.bi)}_${Date.now()}`;
      const caminhos: Partial<Record<ChaveDoc, string>> = {};

      const porEnviar: { chave: ChaveDoc; etiqueta: string }[] = [...DOCS];
      if (dados.experiencia_similar === "sim" && ficheiros.experiencia) {
        porEnviar.push({ chave: "experiencia", etiqueta: "Comprovativo de experiência" });
      }

      for (let i = 0; i < porEnviar.length; i++) {
        const doc = porEnviar[i];
        setEtapa(`A enviar ${doc.etiqueta} (${i + 1}/${porEnviar.length})…`);
        caminhos[doc.chave] = await enviarDocumento(doc.chave, ficheiros[doc.chave]!, pasta);
      }

      // 3) Gravação da candidatura.
      setEtapa("A registar a candidatura…");

      const resposta = await submeterCandidatura(
        dados as unknown as Record<string, string>,
        {
          cv: caminhos.cv!,
          bi: caminhos.bi!,
          certificado: caminhos.certificado!,
          experiencia: caminhos.experiencia ?? null,
        },
        concursoSlug
      );

      if (!resposta.ok) {
        if (resposta.campo) setError(resposta.campo, { message: resposta.mensagem });
        toast.error("Candidatura não registada", { description: resposta.mensagem });
        return;
      }

      // 4) Ecrã de confirmação.
      const referencia = resposta.id!.slice(0, 8).toUpperCase();
      router.push(
        `/app/sucesso?ref=${referencia}&nome=${encodeURIComponent(dados.nome.split(" ")[0])}`
      );
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido.";
      toast.error("Não foi possível concluir", { description: mensagem });
    } finally {
      setAEnviar(false);
      setEtapa("");
    }
  }

  const rotuloErro = (campo: keyof DadosCandidatura) =>
    errors[campo] ? (
      <p className="text-xs font-medium text-rose-600">{errors[campo]?.message as string}</p>
    ) : null;

  return (
    <form onSubmit={handleSubmit(aoSubmeter)} className="space-y-8" noValidate>
      {/* ------------------------------------------------------ ATRIBUIÇÕES */}
      <section className="rounded-xl border border-consulvolt-amarelo/60 bg-amber-50/70 p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="h-5 w-5 text-consulvolt-vermelho" />
          {vagaTitulo ? `Atribuições da Função - ${vagaTitulo}` : "O que vais fazer nesta função"}
        </h2>
        {vagaDescricao ? (
          <p className="mt-2.5 text-sm leading-relaxed text-slate-800 whitespace-pre-line">
            {vagaDescricao}
          </p>
        ) : (
          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {ATRIBUICOES.map((atribuicao) => (
              <li key={atribuicao} className="flex items-start gap-2.5 text-sm">
                <span
                  aria-hidden
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-consulvolt-vermelho"
                />
                <span>{atribuicao}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------ DADOS PESSOAIS */}
      <section className="space-y-4">
        <h2 className="border-l-4 border-consulvolt-vermelho pl-3 text-base font-semibold">
          1. Identificação
        </h2>

        <div className="space-y-1.5">
          <Label htmlFor="nome">
            Nome completo <span className="text-consulvolt-vermelho">*</span>
          </Label>
          <Input
            id="nome"
            placeholder="Ex.: João Manuel dos Santos"
            disabled={aEnviar}
            {...register("nome")}
          />
          {rotuloErro("nome")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bi">
              Nº do Bilhete de Identidade <span className="text-consulvolt-vermelho">*</span>
            </Label>
            <Input
              id="bi"
              placeholder="006151112LA041"
              className="uppercase"
              disabled={aEnviar}
              {...register("bi", { onBlur: (e) => conferirDuplicado("bi", e.target.value) })}
            />
            {rotuloErro("bi") ?? (
              <p className="text-xs text-muted-foreground">
                9 números, 2 letras e 3 números, como vem no cartão.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provincia">
              Província em que reside <span className="text-consulvolt-vermelho">*</span>
            </Label>
            <Controller
              control={control}
              name="provincia"
              render={({ field }) => (
                <Select
                  value={field.value}
                  disabled={aEnviar}
                  onValueChange={(v) => {
                    field.onChange(v);
                    // Trocar de província limpa o município escolhido antes.
                    setValue("municipio", "", { shouldValidate: false });
                  }}
                >
                  <SelectTrigger id="provincia">
                    <SelectValue placeholder="Escolhe a província" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVINCIAS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {rotuloErro("provincia")}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="municipio">
              Município <span className="text-consulvolt-vermelho">*</span>
            </Label>
            <Controller
              control={control}
              name="municipio"
              render={({ field }) => (
                <Select
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                  disabled={aEnviar || !provincia}
                >
                  <SelectTrigger id="municipio">
                    <SelectValue
                      placeholder={provincia ? "Escolhe o município" : "Escolhe primeiro a província"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {municipiosDisponiveis.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {rotuloErro("municipio")}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="telefone">
              Telefone / WhatsApp <span className="text-consulvolt-vermelho">*</span>
            </Label>
            <Input
              id="telefone"
              type="tel"
              inputMode="tel"
              placeholder="9XX XXX XXX"
              disabled={aEnviar}
              {...register("telefone")}
            />
            {rotuloErro("telefone") ?? (
              <p className="text-xs text-muted-foreground">É por aqui que te vamos contactar.</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5 sm:max-w-md">
          <Label htmlFor="email">
            Email <span className="text-consulvolt-vermelho">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            placeholder="nome@exemplo.com"
            disabled={aEnviar}
            {...register("email", { onBlur: (e) => conferirDuplicado("email", e.target.value) })}
          />
          {rotuloErro("email")}
        </div>
      </section>

      {/* --------------------------------------------- FORMAÇÃO / PERFIL */}
      <section className="space-y-4">
        <h2 className="border-l-4 border-consulvolt-vermelho pl-3 text-base font-semibold">
          2. Formação e perfil técnico
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nivel_academico">
              Nível académico <span className="text-consulvolt-vermelho">*</span>
            </Label>
            <Controller
              control={control}
              name="nivel_academico"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value} disabled={aEnviar}>
                  <SelectTrigger id="nivel_academico">
                    <SelectValue placeholder="Escolhe o nível" />
                  </SelectTrigger>
                  <SelectContent>
                    {NIVEIS_ACADEMICOS.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {rotuloErro("nivel_academico")}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="curso">Curso</Label>
            <Input
              id="curso"
              placeholder="Ex.: Electricidade Industrial"
              disabled={aEnviar}
              {...register("curso")}
            />
            {rotuloErro("curso")}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Controller
            control={control}
            name="tem_carta"
            render={({ field }) => (
              <PerguntaSimNao
                nome="carta"
                pergunta="Tens carta de condução válida?"
                ajuda="Ligeiro, pesado ou motociclo"
                valor={field.value}
                aoMudar={field.onChange}
                erro={errors.tem_carta?.message}
                desactivado={aEnviar}
              />
            )}
          />

          {camposDinamicos && camposDinamicos.length > 0 &&
            camposDinamicos.map((campo) => (
              <PerguntaSimNao
                key={campo.chave}
                nome={campo.chave}
                pergunta={campo.rotulo}
                ajuda={campo.ajuda || undefined}
                valor={watch(campo.chave as any) || "nao"}
                aoMudar={(v) => setValue(campo.chave as any, v)}
                desactivado={aEnviar}
              />
            ))}
        </div>

        {/* Experiência em trabalhos similares - com comprovativo se for "sim" */}
        <div className="space-y-3">
          <Controller
            control={control}
            name="experiencia_similar"
            render={({ field }) => (
              <PerguntaSimNao
                nome="experiencia"
                pergunta="Tens experiência em trabalhos similares?"
                ajuda="Cadastro de activos, leitura de contadores, inquéritos de campo, georreferenciamento ou trabalho equivalente"
                valor={field.value}
                aoMudar={(v) => {
                  field.onChange(v);
                  // Ao responder "Não", o anexo deixa de fazer sentido.
                  if (v === "nao") {
                    setFicheiros((antigo) => ({ ...antigo, experiencia: null }));
                    setErrosFicheiro((antigo) => ({ ...antigo, experiencia: undefined }));
                  }
                }}
                erro={errors.experiencia_similar?.message}
                desactivado={aEnviar}
              />
            )}
          />

          {temExperiencia && (
            <div className="rounded-lg border border-consulvolt-vermelho/30 bg-rose-50/50 p-3">
              <CampoFicheiro
                id="ficheiro-experiencia"
                etiqueta="Comprovativo da experiência"
                legenda="Imagem ou documento que comprova a função realizada"
                ficheiro={ficheiros.experiencia}
                erro={errosFicheiro.experiencia}
                desactivado={aEnviar}
                aoMudar={(f) => {
                  setFicheiros((antigo) => ({ ...antigo, experiencia: f }));
                  setErrosFicheiro((antigo) => ({ ...antigo, experiencia: undefined }));
                }}
              />
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------ DOCUMENTOS */}
      <section className="space-y-4">
        <h2 className="border-l-4 border-consulvolt-vermelho pl-3 text-base font-semibold">
          3. Documentos
        </h2>
        <p className="text-sm text-muted-foreground">
          Os três documentos são obrigatórios. Formatos aceites: PDF, JPG ou PNG, até{" "}
          {TAMANHO_MAXIMO_KB} KB cada. Fotos tiradas com o telemóvel são reduzidas
          automaticamente - basta anexar.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {DOCS.map((doc) => (
            <CampoFicheiro
              key={doc.chave}
              id={`ficheiro-${doc.chave}`}
              etiqueta={doc.etiqueta}
              descricao={doc.descricao}
              ficheiro={ficheiros[doc.chave]}
              erro={errosFicheiro[doc.chave]}
              desactivado={aEnviar}
              aoMudar={(f) => {
                setFicheiros((antigo) => ({ ...antigo, [doc.chave]: f }));
                setErrosFicheiro((antigo) => ({ ...antigo, [doc.chave]: undefined }));
              }}
            />
          ))}
        </div>
      </section>

      {/* -------------------------------------------- CONDIÇÕES DE TRABALHO */}
      <section className="space-y-4">
        <h2 className="border-l-4 border-consulvolt-vermelho pl-3 text-base font-semibold">
          4. Condições de trabalho
        </h2>

        <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 sm:p-5">
          <p className="flex items-start gap-2 text-sm font-medium">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>Lê com atenção antes de te candidatares. Esta função é de campo.</span>
          </p>

          <ul className="mt-3 space-y-2">
            {CONDICOES_TRABALHO.map((condicao) => (
              <li key={condicao} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span
                  aria-hidden
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"
                />
                <span>{condicao}</span>
              </li>
            ))}
          </ul>
        </div>

        <Controller
          control={control}
          name="condicoes_aceites"
          render={({ field }) => (
            <div
              className={cn(
                "flex items-start gap-3 rounded-lg border-2 p-4 transition-colors",
                field.value
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-slate-300 bg-white",
                errors.condicoes_aceites && "border-rose-400 bg-rose-50"
              )}
            >
              <Checkbox
                id="condicoes_aceites"
                className="mt-0.5"
                checked={Boolean(field.value)}
                onCheckedChange={(v) => field.onChange(v === true)}
                disabled={aEnviar}
              />
              <Label htmlFor="condicoes_aceites" className="cursor-pointer text-sm leading-relaxed">
                Confirmo que tomei conhecimento das atribuições da função e das condições de
                trabalho acima descritas, e que reúno as condições físicas para as cumprir.{" "}
                <span className="text-consulvolt-vermelho">*</span>
              </Label>
            </div>
          )}
        />

        {errors.condicoes_aceites && (
          <p className="text-xs font-medium text-rose-600">
            {errors.condicoes_aceites.message as string}
          </p>
        )}
      </section>

      {/* --------------------------------------------------------- ENVIO */}
      <div className="space-y-3 border-t pt-6">
        <p className="text-xs text-muted-foreground">
          Ao submeter, autorizas a CONSULVOLT a tratar os teus dados e documentos para efeitos deste
          processo de recrutamento.
        </p>

        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={aEnviar}>
          {aEnviar ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {etapa || "A enviar…"}
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submeter candidatura
            </>
          )}
        </Button>

        {aEnviar && (
          <p className="text-xs text-muted-foreground">
            Não feches nem actualizes esta página até ao fim do envio.
          </p>
        )}
      </div>
    </form>
  );
}
