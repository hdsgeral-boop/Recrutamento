"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarPlus,
  CalendarX2,
  Bell,
  Loader2,
  Mail,
  RotateCcw,
  Send,
  ThumbsDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { LOCAIS_ENTREVISTA, NOTAS_ENTREVISTA_PADRAO } from "@/lib/constantes-email";
import {
  agendarEntrevista,
  comunicarReprovacao,
  desmarcarEntrevista,
  enviarLembrete,
  enviarMensagem,
  reenviarConfirmacao,
} from "@/app/admin/accoes-email";
import type { Candidato } from "@/types/database";

const OUTRO = "__outro__";

/** Data e hora locais (Angola) prontas para os campos do formulário. */
function partes(iso: string | null) {
  if (!iso) return { data: "", hora: "" };
  const d = new Date(iso);
  const pt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Luanda",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  const [data, hora] = pt.split(" ");
  return { data, hora };
}

/* ------------------------------------------------------------------ */
/* Marcar ou remarcar a entrevista                                     */
/* ------------------------------------------------------------------ */

export function BotaoAgendar({
  candidato,
  variante = "default",
}: {
  candidato: Candidato;
  variante?: "default" | "outline";
}) {
  const router = useRouter();
  const jaMarcada = Boolean(candidato.entrevista_em);
  const inicial = partes(candidato.entrevista_em);

  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(inicial.data);
  const [hora, setHora] = useState(inicial.hora || "09:00");
  const [localEscolhido, setLocalEscolhido] = useState<string>(
    candidato.entrevista_local && !LOCAIS_ENTREVISTA.includes(candidato.entrevista_local as never)
      ? OUTRO
      : candidato.entrevista_local ?? LOCAIS_ENTREVISTA[0]
  );
  const [localLivre, setLocalLivre] = useState(candidato.entrevista_local ?? "");
  const [notas, setNotas] = useState(candidato.entrevista_notas ?? NOTAS_ENTREVISTA_PADRAO);
  const [enviar, setEnviar] = useState(true);
  const [aprovar, setAprovar] = useState(candidato.status !== "Aprovado");
  const [aGravar, iniciar] = useTransition();

  const local = localEscolhido === OUTRO ? localLivre : localEscolhido;
  const hoje = new Date().toISOString().slice(0, 10);

  function gravar() {
    iniciar(async () => {
      const r = await agendarEntrevista({
        id: candidato.id,
        data,
        hora,
        local,
        notas,
        enviarEmail: enviar,
        aprovar,
      });
      if (r.ok) {
        toast.success(r.mensagem);
        setAberto(false);
        router.refresh();
      } else {
        toast.error("Não foi possível", { description: r.mensagem });
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant={variante} size="sm">
          <CalendarPlus className="h-4 w-4" />
          {jaMarcada ? "Remarcar entrevista" : "Marcar entrevista"}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {jaMarcada ? "Remarcar entrevista" : "Marcar entrevista"} - {candidato.nome}
          </DialogTitle>
          <DialogDescription>
            {jaMarcada
              ? "O candidato recebe um email a dizer que a data anterior deixou de ser válida."
              : "O candidato recebe um email a dizer que foi seleccionado, com a data e o local."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="data-entrevista">Data</Label>
              <Input
                id="data-entrevista"
                type="date"
                min={hoje}
                value={data}
                onChange={(e) => setData(e.target.value)}
                disabled={aGravar}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hora-entrevista">Hora</Label>
              <Input
                id="hora-entrevista"
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                disabled={aGravar}
              />
              <p className="text-xs text-muted-foreground">Hora de Angola</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Local</Label>
            <Select value={localEscolhido} onValueChange={setLocalEscolhido} disabled={aGravar}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCAIS_ENTREVISTA.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
                <SelectItem value={OUTRO}>Outro (escrever)</SelectItem>
              </SelectContent>
            </Select>
            {localEscolhido === OUTRO && (
              <Input
                placeholder="Onde é a entrevista?"
                value={localLivre}
                onChange={(e) => setLocalLivre(e.target.value)}
                disabled={aGravar}
                className="mt-2"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notas-entrevista">Indicações para o candidato</Label>
            <Textarea
              id="notas-entrevista"
              rows={3}
              maxLength={1500}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              disabled={aGravar}
            />
            <p className="text-xs text-muted-foreground">
              Vai no email tal como está escrito. O que levar, com quem falar, como chegar.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border bg-slate-50 p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={enviar}
                onCheckedChange={(v) => setEnviar(v === true)}
                disabled={aGravar}
                className="mt-0.5"
              />
              <span className="text-sm">
                Enviar email a <strong>{candidato.email}</strong>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={aprovar}
                onCheckedChange={(v) => setAprovar(v === true)}
                disabled={aGravar}
                className="mt-0.5"
              />
              <span className="text-sm">Passar o estado para Aprovado</span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={aGravar}>
            Cancelar
          </Button>
          <Button onClick={gravar} disabled={aGravar || !data || !hora || local.trim().length < 3}>
            {aGravar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {enviar ? "Marcar e enviar" : "Marcar sem avisar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Mensagem escrita à mão                                              */
/* ------------------------------------------------------------------ */

export function BotaoMensagem({ candidato }: { candidato: Candidato }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [aEnviar, iniciar] = useTransition();

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="h-4 w-4" />
          Escrever email
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Escrever a {candidato.nome.split(" ")[0]}</DialogTitle>
          <DialogDescription>
            Vai para {candidato.email}, com o cabeçalho e a assinatura da Consulvolt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="assunto">Assunto</Label>
            <Input
              id="assunto"
              maxLength={160}
              placeholder="Ex.: Documento em falta na tua candidatura"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              disabled={aEnviar}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mensagem">Mensagem</Label>
            <Textarea
              id="mensagem"
              rows={7}
              maxLength={4000}
              placeholder="Escreve como falarias com a pessoa. As quebras de linha são respeitadas."
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              disabled={aEnviar}
            />
            <p className="text-xs text-muted-foreground">
              O nome do candidato e a referência da candidatura são acrescentados automaticamente.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={aEnviar}>
            Cancelar
          </Button>
          <Button
            disabled={aEnviar || assunto.trim().length < 4 || mensagem.trim().length < 10}
            onClick={() =>
              iniciar(async () => {
                const r = await enviarMensagem(candidato.id, assunto, mensagem);
                if (r.ok) {
                  toast.success(r.mensagem);
                  setAberto(false);
                  setAssunto("");
                  setMensagem("");
                  router.refresh();
                } else {
                  toast.error("Não enviou", { description: r.mensagem });
                }
              })
            }
          >
            {aEnviar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Comunicar não selecção                                              */
/* ------------------------------------------------------------------ */

export function BotaoReprovar({ candidato }: { candidato: Candidato }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nota, setNota] = useState("");
  const [aEnviar, iniciar] = useTransition();

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ThumbsDown className="h-4 w-4" />
          Comunicar não selecção
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comunicar não selecção</DialogTitle>
          <DialogDescription>
            {candidato.nome} recebe um email respeitoso, e o estado passa a Reprovado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="nota-reprovacao">Nota adicional (opcional)</Label>
          <Textarea
            id="nota-reprovacao"
            rows={3}
            maxLength={1000}
            placeholder="Ex.: Guardamos o teu processo para o próximo levantamento, previsto para Janeiro."
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={aEnviar}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={aEnviar}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={aEnviar}
            onClick={() =>
              iniciar(async () => {
                const r = await comunicarReprovacao(candidato.id, nota);
                if (r.ok) {
                  toast.success(r.mensagem);
                  setAberto(false);
                  router.refresh();
                } else {
                  toast.error("Atenção", { description: r.mensagem });
                }
              })
            }
          >
            {aEnviar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar e marcar como Reprovado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Acções soltas                                                       */
/* ------------------------------------------------------------------ */

function AccaoSimples({
  icone: Icone,
  texto,
  accao,
}: {
  icone: typeof Bell;
  texto: string;
  accao: () => Promise<{ ok: boolean; mensagem: string }>;
}) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={aCorrer}
      onClick={() =>
        iniciar(async () => {
          const r = await accao();
          r.ok ? toast.success(r.mensagem) : toast.error(r.mensagem);
          router.refresh();
        })
      }
    >
      {aCorrer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icone className="h-4 w-4" />}
      {texto}
    </Button>
  );
}

export function BotaoLembrete({ id }: { id: string }) {
  return <AccaoSimples icone={Bell} texto="Enviar lembrete" accao={() => enviarLembrete(id)} />;
}

export function BotaoDesmarcar({ id }: { id: string }) {
  return (
    <AccaoSimples icone={CalendarX2} texto="Desmarcar" accao={() => desmarcarEntrevista(id)} />
  );
}

export function BotaoReenviarConfirmacao({ id }: { id: string }) {
  return (
    <AccaoSimples
      icone={RotateCcw}
      texto="Reenviar confirmação"
      accao={() => reenviarConfirmacao(id)}
    />
  );
}
