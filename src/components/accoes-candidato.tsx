"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Loader2, MessageCircle, RefreshCw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

import { STATUS, type Status } from "@/lib/constantes";
import { ETIQUETAS_MODELO, linkWhatsApp, type ModeloMensagem } from "@/lib/whatsapp";
import { mudarStatus, obterLinksDocumentos, reprocessarArquivamento } from "@/app/admin/accoes";
import type { Candidato } from "@/types/database";

/** Botão que descarrega os três documentos do candidato de uma vez. */
export function BotaoDocumentos({
  candidato,
  variante = "outline",
  tamanho = "sm",
}: {
  candidato: Candidato;
  variante?: "outline" | "default" | "ghost";
  tamanho?: "sm" | "default";
}) {
  const [aCarregar, setACarregar] = useState(false);

  async function descarregar() {
    setACarregar(true);
    try {
      const resposta = await obterLinksDocumentos(candidato.id);

      if (!resposta.ok) {
        toast.error("Documentos indisponíveis", { description: resposta.mensagem });
        return;
      }

      // Abrimos os links com um pequeno intervalo, senão o browser bloqueia.
      resposta.documentos.forEach((doc, i) => {
        setTimeout(() => window.open(doc.urlBaixar, "_blank", "noopener"), i * 400);
      });

      toast.success(`${resposta.documentos.length} documento(s) a descarregar.`);
    } finally {
      setACarregar(false);
    }
  }

  return (
    <Button variant={variante} size={tamanho} onClick={descarregar} disabled={aCarregar}>
      {aCarregar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Documentos
    </Button>
  );
}

/** Botão de WhatsApp com escolha do modelo de mensagem. */
export function BotaoWhatsApp({ candidato }: { candidato: Candidato }) {
  const [aberto, setAberto] = useState(false);
  const [modelo, setModelo] = useState<ModeloMensagem>("convocatoria");

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="whatsapp" size="sm">
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar WhatsApp a {candidato.nome.split(" ")[0]}</DialogTitle>
          <DialogDescription>
            Número: <strong>+{candidato.telefone}</strong>. Escolhe a mensagem - abre no WhatsApp já
            escrita, e só tens de carregar em enviar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Modelo de mensagem</Label>
            <Select value={modelo} onValueChange={(v) => setModelo(v as ModeloMensagem)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ETIQUETAS_MODELO) as ModeloMensagem[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {ETIQUETAS_MODELO[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
            {decodeURIComponent(linkWhatsApp(candidato, modelo).split("?text=")[1] ?? "")}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button
            variant="whatsapp"
            onClick={() => {
              window.open(linkWhatsApp(candidato, modelo), "_blank", "noopener");
              setAberto(false);
            }}
          >
            <MessageCircle className="h-4 w-4" />
            Abrir no WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Diálogo para mudar o estado da candidatura e deixar notas internas. */
/**
 * Os estados por que se pode mudar uma candidatura.
 *
 * A lista chega de fora porque é configurável em Definições. Quando não chega
 * - um sítio do painel que ainda não a passe - usam-se os quatro de sempre,
 * para o botão nunca aparecer vazio.
 */
export function BotaoEstado({
  candidato,
  estados,
}: {
  candidato: Candidato;
  estados?: readonly string[];
}) {
  const opcoes = estados && estados.length > 0 ? estados : STATUS;

  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<Status>(candidato.status);
  const [notas, setNotas] = useState(candidato.observacoes ?? "");
  const [aGravar, iniciar] = useTransition();

  function gravar() {
    iniciar(async () => {
      const resposta = await mudarStatus(candidato.id, estado, notas);

      if (resposta.ok) {
        toast.success(resposta.mensagem);
        setAberto(false);
        router.refresh();
      } else {
        toast.error("Não gravou", { description: resposta.mensagem });
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Mudar estado
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estado da candidatura</DialogTitle>
          <DialogDescription>{candidato.nome}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as Status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {opcoes.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
                {/* O valor gravado pode já não estar na lista configurada.
                    Mostra-se na mesma, senão o campo abria em branco e a
                    primeira gravação mudava o estado sem ninguém pedir. */}
                {!opcoes.includes(candidato.status) && (
                  <SelectItem value={candidato.status}>
                    {candidato.status} (estado antigo)
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações internas</Label>
            <Textarea
              id="observacoes"
              rows={4}
              maxLength={2000}
              placeholder="Ex.: entrevistado a 12/09, disponível de imediato."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Estas notas só aparecem no painel - o candidato nunca as vê.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={aGravar}>
            Cancelar
          </Button>
          <Button onClick={gravar} disabled={aGravar}>
            {aGravar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Gravar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Repete o envio para o Drive e os emails, quando algo falhou. */
export function BotaoReprocessar({ id }: { id: string }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={aCorrer}
      onClick={() =>
        iniciar(async () => {
          const r = await reprocessarArquivamento(id);
          r.ok ? toast.success(r.mensagem) : toast.error(r.mensagem);
          setTimeout(() => router.refresh(), 4000);
        })
      }
    >
      {aCorrer ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      Repetir arquivamento
    </Button>
  );
}
