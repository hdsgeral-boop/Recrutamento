"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Lock, Save, Users2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Interruptor } from "@/components/ui/interruptor";
import { guardarDefinicoes } from "@/app/admin/accoes-definicoes";
import { dataHora, isoParaInput } from "@/lib/datas";
import type { Definicoes } from "@/lib/definicoes";

/**
 * Formulário das definições do recrutamento.
 *
 * Só há três coisas para decidir aqui, e todas mudam o que o público vê, por
 * isso cada uma diz em texto simples o efeito que tem.
 */
export function PainelDefinicoes({ iniciais }: { iniciais: Definicoes }) {
  const router = useRouter();
  const [aGuardar, comTransicao] = useTransition();

  const [prazoLocal, setPrazoLocal] = useState(() => isoParaInput(iniciais.prazo));
  const [vagas, setVagas] = useState(String(iniciais.vagasPrevistas));
  const [abertas, setAbertas] = useState(iniciais.candidaturasAbertas);
  const [mensagem, setMensagem] = useState(iniciais.mensagemEncerrado ?? "");
  const [actualizado, setActualizado] = useState({
    em: iniciais.actualizadoEm,
    por: iniciais.actualizadoPor,
  });

  const prazoPassou = (() => {
    const t = new Date(prazoLocal).getTime();
    return Number.isFinite(t) && t < Date.now();
  })();

  function guardar() {
    comTransicao(async () => {
      const r = await guardarDefinicoes({
        prazoLocal,
        vagasPrevistas: Number(vagas),
        candidaturasAbertas: abertas,
        mensagemEncerrado: mensagem,
      });

      if (!r.ok) {
        toast.error(r.mensagem);
        return;
      }

      toast.success(r.mensagem);
      if (r.definicoes) {
        setActualizado({ em: r.definicoes.actualizadoEm, por: r.definicoes.actualizadoPor });
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------ PRAZO */}
      <section className="rounded-xl border bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-consulvolt-vermelho" />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="font-semibold">Prazo das candidaturas</h2>
              <p className="text-sm text-muted-foreground">
                Hora de Angola. Passado este momento o formulário deixa de aceitar candidaturas e o
                contador na página pública passa a &ldquo;encerradas&rdquo;.
              </p>
            </div>

            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="prazo">Fecha em</Label>
              <Input
                id="prazo"
                type="datetime-local"
                value={prazoLocal}
                onChange={(e) => setPrazoLocal(e.target.value)}
                disabled={aGuardar}
              />
              {prazoPassou && (
                <p className="text-xs text-amber-700">
                  Esta data já passou: guardar assim fecha as candidaturas de imediato.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ VAGAS */}
      <section className="rounded-xl border bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Users2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="font-semibold">Vagas previstas</h2>
              <p className="text-sm text-muted-foreground">
                Quantos técnicos se pretende contratar. Serve para o painel comparar candidaturas
                com lugares.{" "}
                <strong className="text-slate-900">
                  Este número nunca aparece no formulário nem em email nenhum.
                </strong>
              </p>
            </div>

            <div className="max-w-[8rem] space-y-1.5">
              <Label htmlFor="vagas">Número de vagas</Label>
              <Input
                id="vagas"
                type="number"
                min={1}
                max={500}
                value={vagas}
                onChange={(e) => setVagas(e.target.value)}
                disabled={aGuardar}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- FECHO */}
      <section className="rounded-xl border bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="font-semibold">Estado do formulário</h2>
              <p className="text-sm text-muted-foreground">
                Um interruptor para fechar antes do prazo, se as candidaturas chegarem a mais do que
                a equipa consegue analisar.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
              <Label htmlFor="abertas" className="cursor-pointer text-sm font-medium">
                {abertas ? "A receber candidaturas" : "Fechado manualmente"}
              </Label>
              <Interruptor
                id="abertas"
                ligado={abertas}
                aoMudar={setAbertas}
                desactivado={aGuardar}
                rotulo="Aceitar candidaturas"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mensagem">Aviso a quem chegar depois do fecho</Label>
              <Textarea
                id="mensagem"
                rows={3}
                maxLength={500}
                placeholder="Deixa vazio para usar o texto padrão."
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                disabled={aGuardar}
              />
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- GRAVAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <p className="text-xs text-muted-foreground">
          {actualizado.em
            ? `Última alteração: ${dataHora(actualizado.em)}${
                actualizado.por ? ` por ${actualizado.por}` : ""
              }`
            : "Ainda não foi alterado desde a instalação."}
        </p>

        <Button onClick={guardar} disabled={aGuardar}>
          {aGuardar ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Guardar definições
        </Button>
      </div>
    </div>
  );
}
