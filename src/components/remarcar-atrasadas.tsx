"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus, Loader2, MailCheck, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { remarcarAtrasadas } from "@/app/admin/accoes-atribuicao";
import {
  dataFutura,
  hojeEmAngola,
  mesmaHoraNoutroDia,
  minimoParaInput,
  proximoDiaUtil,
  somarDias,
} from "@/lib/entrevista/quando";
import { doInputParaIso, isoParaInput, porExtensoComDia } from "@/lib/datas";
import type { LinhaEntrevista } from "@/lib/entrevista/atribuicoes";

/**
 * ===========================================================================
 * AS QUE FICARAM PARA TRÁS
 * ---------------------------------------------------------------------------
 * Entrevistas com data já passada e sem avaliação guardada. Ou o candidato
 * não apareceu, ou a equipa não chegou lá, ou a data foi mal escrita - e em
 * qualquer dos casos o processo parou sem que ninguém desse por isso.
 *
 * DUAS MANEIRAS DE REMARCAR, e a diferença entre elas é real:
 *
 *   EMPURRAR, mantendo tudo o resto. Quem estava às 09:00 fica às 09:00, só
 *   noutro dia. É o caminho para quando foi a equipa que não chegou lá: a
 *   agenda já estava pensada, e refazê-la à mão era deitar fora esse trabalho.
 *
 *   ESCREVER UMA DATA NOVA, candidato a candidato. É o caminho para quando
 *   cada caso é um caso - um pediu para ser de manhã, outro só pode na
 *   semana seguinte.
 *
 * As duas convivem na mesma lista: empurra-se o lote todo e corrige-se à mão
 * as duas ou três que precisam.
 * ===========================================================================
 */

const TAMANHO_LOTE = 5;

export function RemarcarAtrasadas({
  linhas,
  podeEnviarEmail,
}: {
  linhas: LinhaEntrevista[];
  podeEnviarEmail: boolean;
}) {
  const router = useRouter();

  /** A data nova de cada candidato, no formato do campo. Vazio = por decidir. */
  const [novas, setNovas] = useState<Record<string, string>>({});
  const [escolhidos, setEscolhidos] = useState<Set<string>>(
    () => new Set(linhas.map((l) => l.candidatoId))
  );
  const [diaDestino, setDiaDestino] = useState(() => proximoDiaUtil(somarDias(hojeEmAngola(), 1)));
  const [avisar, setAvisar] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [aCorrer, setACorrer] = useState(false);
  const [feitos, setFeitos] = useState(0);

  const trocar = (id: string) =>
    setEscolhidos((antes) => {
      const novo = new Set(antes);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  /**
   * Empurra os escolhidos para o dia indicado, mantendo a hora de cada um.
   *
   * Quem não tem data antiga legível fica de fora em vez de receber uma hora
   * inventada: seria pior do que deixá-lo por remarcar.
   */
  function empurrar() {
    const alvo = proximoDiaUtil(diaDestino);
    let feitas = 0;
    let falhadas = 0;

    setNovas((antes) => {
      const novo = { ...antes };
      for (const l of linhas) {
        if (!escolhidos.has(l.candidatoId) || !l.quando) continue;
        const iso = mesmaHoraNoutroDia(l.quando, alvo);
        if (!iso) {
          falhadas++;
          continue;
        }
        novo[l.candidatoId] = isoParaInput(iso);
        feitas++;
      }
      return novo;
    });

    if (feitas === 0) return toast.error("Nenhuma das escolhidas tinha hora para manter.");
    toast.success(
      `${feitas} entrevista(s) passaram para ${porExtensoComDia(
        new Date(`${alvo}T12:00:00+01:00`).toISOString()
      ).split(" às ")[0]}, à mesma hora.` + (falhadas ? ` ${falhadas} sem hora legível ficaram de fora.` : "")
    );
  }

  const prontos = useMemo(
    () =>
      linhas
        .filter((l) => escolhidos.has(l.candidatoId))
        .map((l) => ({ l, valor: novas[l.candidatoId] ?? "" }))
        .filter(({ valor }) => valor),
    [linhas, escolhidos, novas]
  );

  const comDataMa = prontos.filter(({ valor }) => {
    const iso = doInputParaIso(valor);
    return !iso || !dataFutura(iso).ok;
  });

  async function remarcar() {
    if (prontos.length === 0) {
      return toast.error("Nenhuma das escolhidas tem data nova. Empurra o lote, ou escreve à mão.");
    }
    if (comDataMa.length > 0) {
      return toast.error(`${comDataMa.length} data(s) nova(s) ainda estão no passado ou inválidas.`);
    }

    const confirmado = window.confirm(
      `Vais remarcar ${prontos.length} entrevista(s)` +
        (avisar && podeEnviarEmail ? " e avisar cada candidato por email" : ", sem avisar ninguém") +
        ". Emails enviados não se apagam. Continuar?"
    );
    if (!confirmado) return;

    setACorrer(true);
    setFeitos(0);

    const pedidos = prontos.map(({ l, valor }) => ({
      candidatoId: l.candidatoId,
      novoInicio: doInputParaIso(valor)!,
    }));

    let remarcados = 0;
    let emails = 0;
    const problemas: string[] = [];

    try {
      for (let i = 0; i < pedidos.length; i += TAMANHO_LOTE) {
        const r = await remarcarAtrasadas(
          pedidos.slice(i, i + TAMANHO_LOTE),
          avisar && podeEnviarEmail,
          motivo
        );
        remarcados += r.remarcados;
        emails += r.emailsEnviados;
        problemas.push(...r.problemas);
        setFeitos(Math.min(i + TAMANHO_LOTE, pedidos.length));
        if (i + TAMANHO_LOTE < pedidos.length) await new Promise((r) => setTimeout(r, 400));
      }

      problemas.length === 0
        ? toast.success(`${remarcados} remarcada(s), ${emails} avisado(s).`)
        : toast.warning(`${remarcados} remarcada(s), ${problemas.length} com problema.`);
      if (problemas.length) console.warn("[atrasadas]", problemas);

      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "A remarcação foi interrompida.");
    } finally {
      setACorrer(false);
    }
  }

  if (linhas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-white py-14 text-center">
        <CalendarClock className="h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium">Nenhuma entrevista ficou para trás</p>
        <p className="max-w-md px-6 text-sm text-muted-foreground">
          Aparecem aqui as entrevistas com data já passada que ainda não têm avaliação guardada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="font-semibold text-amber-900">
            {linhas.length} entrevista(s) com data já passada e sem avaliação
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Ou o candidato não apareceu, ou a equipa não chegou lá, ou a data foi mal escrita. Em
            qualquer dos casos o processo parou. Dá-lhes data nova e avisa-os.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------ EMPURRAR O LOTE -- */}
      <section className="rounded-xl border bg-white p-3 sm:p-4">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <CalendarPlus className="h-3.5 w-3.5" />
          Remarcar com o que já tinham
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cada um fica com a <strong>mesma hora</strong>, a mesma sala e o mesmo local que já tinha,
          só noutro dia. Depois podes corrigir à mão os casos que precisarem.
        </p>

        <div className="mt-2.5 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="dia-destino" className="text-[11px]">
              Passar tudo para
            </Label>
            <Input
              id="dia-destino"
              type="date"
              min={hojeEmAngola()}
              value={diaDestino}
              onChange={(e) => setDiaDestino(e.target.value)}
              className="h-9 w-[168px]"
            />
          </div>

          <Button variant="outline" onClick={empurrar} disabled={escolhidos.size === 0}>
            <CalendarPlus className="h-4 w-4" />
            <span className="ml-2">Aplicar aos {escolhidos.size} escolhidos</span>
          </Button>

          <span className="text-[11px] text-muted-foreground">
            Um sábado ou domingo salta para a segunda seguinte.
          </span>
        </div>
      </section>

      {/* ------------------------------------------------------ A LISTA ---- */}
      <ul className="space-y-2">
        {linhas.map((l) => {
          const valor = novas[l.candidatoId] ?? "";
          const iso = valor ? doInputParaIso(valor) : null;
          const ma = Boolean(valor) && (!iso || !dataFutura(iso).ok);
          const activo = escolhidos.has(l.candidatoId);

          return (
            <li
              key={l.candidatoId}
              className={cn(
                "rounded-xl border bg-white p-3 transition-colors",
                !activo && "opacity-50",
                ma && "border-rose-300 bg-rose-50"
              )}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={() => trocar(l.candidatoId)}
                  className="h-4 w-4 shrink-0 accent-[color:var(--consulvolt-vermelho,#c62828)]"
                />

                <div className="min-w-0 flex-1 basis-[200px]">
                  <p className="truncate text-sm font-medium">{l.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.municipio}
                    {l.recrutadores.length > 0 && ` · ${l.recrutadores.join(", ")}`}
                  </p>
                </div>

                <div className="shrink-0 text-xs">
                  <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                    estava marcada para
                  </span>
                  <span className="font-medium text-rose-700 line-through">
                    {l.quando ? porExtensoComDia(l.quando) : "sem data"}
                  </span>
                </div>

                <div className="shrink-0">
                  <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted-foreground">
                    data nova
                  </span>
                  <input
                    type="datetime-local"
                    value={valor}
                    min={minimoParaInput()}
                    onChange={(e) =>
                      setNovas((antes) => ({ ...antes, [l.candidatoId]: e.target.value }))
                    }
                    className={cn(
                      "h-9 rounded-md border bg-white px-2 font-mono text-xs",
                      ma ? "border-rose-400 text-rose-800" : valor ? "border-emerald-400" : "border-input"
                    )}
                  />
                </div>
              </div>

              {ma && (
                <p className="mt-1.5 text-[11px] font-medium text-rose-700">
                  Essa data também já passou. Escolhe uma data futura.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* ------------------------------------------------------ ENVIAR ---- */}
      <section className="space-y-2.5 rounded-xl border bg-slate-50 p-3 sm:p-4">
        <div className="space-y-1">
          <Label htmlFor="motivo-rem" className="text-xs">
            Motivo (fica no histórico, não vai no email)
          </Label>
          <Input
            id="motivo-rem"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: a equipa não chegou ao Kilamba nesse dia"
            className="h-9 bg-white"
          />
        </div>

        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={avisar && podeEnviarEmail}
            disabled={!podeEnviarEmail}
            onChange={(e) => setAvisar(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          <span className={cn(!podeEnviarEmail && "text-muted-foreground")}>
            Avisar cada candidato por email da data nova
            {!podeEnviarEmail && " (o teu papel não permite enviar emails)"}
          </span>
        </label>

        <Button
          className="w-full"
          disabled={aCorrer || prontos.length === 0 || comDataMa.length > 0}
          onClick={remarcar}
        >
          {aCorrer ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : avisar && podeEnviarEmail ? (
            <MailCheck className="h-4 w-4" />
          ) : (
            <CalendarClock className="h-4 w-4" />
          )}
          <span className="ml-2">
            {aCorrer
              ? `${feitos} de ${prontos.length}`
              : prontos.length === 0
                ? "Dá-lhes uma data nova primeiro"
                : comDataMa.length > 0
                  ? `Corrige ${comDataMa.length} data(s) no passado`
                  : `Remarcar ${prontos.length}${avisar && podeEnviarEmail ? " e avisar" : ""}`}
          </span>
        </Button>

        <p className="text-[11px] leading-snug text-muted-foreground">
          Remarcar em silêncio é pior do que não remarcar: o candidato continua sem saber, e o
          painel passa a dizer que está tudo bem. Por isso o aviso vem ligado.
        </p>
      </section>
    </div>
  );
}
