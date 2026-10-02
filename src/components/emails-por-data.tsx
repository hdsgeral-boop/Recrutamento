"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarSearch, Download, Mail, MailWarning, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  diaEmAngola,
  horaEmAngola,
  listarPorData,
  resumirDia,
  type Criterio,
  type EmailParaLista,
  type EventoParaLista,
} from "@/lib/comunicacoes/por-data";
import { DEFINICOES_FASE, FASES, type Fase } from "@/lib/constantes-fases";
import { ETIQUETAS_EMAIL } from "@/lib/constantes-email";

/**
 * ===========================================================================
 * LISTAR EMAILS POR DATA
 * ---------------------------------------------------------------------------
 * Escolhe-se um dia e vê-se o que saiu. A escolha que dá valor a isto é a do
 * CRITÉRIO, e vale a pena não a esconder atrás de um valor de omissão calado:
 *
 *   «Marcados para este dia»  quem foi convocado PARA aquele dia. É o que se
 *                             quer na véspera de uma jornada de entrevistas.
 *   «Enviados neste dia»      o que saiu naquele dia, seja para quando for.
 *                             É o que se quer quando se pergunta «o que é que
 *                             a equipa mandou ontem?».
 *
 * A conta faz-se toda aqui no browser, sobre dados que a página já carregou.
 * Mudar de dia é instantâneo e não custa uma ida à base de dados.
 * ===========================================================================
 */

export function EmailsPorData({
  emails,
  eventos,
  nomePorCandidato,
  hoje,
}: {
  emails: EmailParaLista[];
  eventos: EventoParaLista[];
  nomePorCandidato: Record<string, string>;
  /** "AAAA-MM-DD" em hora de Angola, calculado no servidor. */
  hoje: string;
}) {
  const [dia, setDia] = useState(hoje);
  const [criterio, setCriterio] = useState<Criterio>("marcado");
  const [fases, setFases] = useState<Fase[]>([]);
  const [comFalhados, setComFalhados] = useState(true);

  const linhas = useMemo(
    () => listarPorData(emails, eventos, { dia, criterio, fases, tipos: [], comFalhados }),
    [emails, eventos, dia, criterio, fases, comFalhados]
  );

  const resumo = useMemo(() => resumirDia(linhas), [linhas]);

  // Os dias que têm mesmo alguma coisa, para não se andar às cegas no
  // calendário à procura de um dia com envios.
  const diasComAlgo = useMemo(() => {
    const dias = new Map<string, number>();
    const fonte = criterio === "enviado" ? emails.map((e) => e.enviadoEm) : eventos.map((e) => e.quando);
    for (const iso of fonte) {
      const d = diaEmAngola(iso);
      if (d) dias.set(d, (dias.get(d) ?? 0) + 1);
    }
    return [...dias.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [emails, eventos, criterio]);

  const descarregar = () => {
    const cabecalho = ["Nome", "Email", "Tipo", "Estado", "Enviado em", "Fase", "Encontro", "Local"];
    const csv = [
      cabecalho.join(";"),
      ...linhas.map((l) =>
        [
          nomePorCandidato[l.email.candidatoId] ?? l.email.candidatoId,
          l.email.destinatario,
          ETIQUETAS_EMAIL[l.email.tipo as keyof typeof ETIQUETAS_EMAIL] ?? l.email.tipo,
          l.email.estado === "erro" ? "FALHOU" : "enviado",
          `${diaEmAngola(l.email.enviadoEm)} ${horaEmAngola(l.email.enviadoEm)}`,
          l.evento ? (DEFINICOES_FASE[l.evento.fase as Fase]?.rotulo ?? l.evento.fase) : "",
          l.evento ? `${diaEmAngola(l.evento.quando)} ${horaEmAngola(l.evento.quando)}` : "",
          l.evento?.local ?? "",
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(";")
      ),
    ].join("\n");

    // BOM para o Excel em português abrir os acentos correctamente.
    const ficheiro = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(ficheiro);
    const a = document.createElement("a");
    a.href = url;
    a.download = `emails-${criterio}-${dia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarSearch className="h-5 w-5 text-consulvolt-vermelho" aria-hidden />
            Listar emails enviados por data
          </h2>
          <p className="text-sm text-muted-foreground">
            Escolhe o dia e vê quem foi avisado, para que encontro e a que horas.
          </p>
        </div>

        <Button
          type="button" variant="outline" size="sm"
          onClick={descarregar}
          disabled={linhas.length === 0}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Descarregar lista
        </Button>
      </div>

      {/* ------------------------------------------------------ CONTROLOS */}
      <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-medium text-slate-700">
          Dia
          <input
            type="date"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
          />
        </label>

        <label className="block text-xs font-medium text-slate-700">
          O que é esta data
          <select
            value={criterio}
            onChange={(e) => setCriterio(e.target.value as Criterio)}
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="marcado">Encontros marcados para este dia</option>
            <option value="enviado">Emails que saíram neste dia</option>
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-700">
          Fase
          <select
            value={fases[0] ?? ""}
            onChange={(e) => setFases(e.target.value ? [e.target.value as Fase] : [])}
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="">Todas as fases</option>
            {FASES.map((f) => (
              <option key={f} value={f}>
                {DEFINICOES_FASE[f].rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-end gap-2 text-xs font-medium text-slate-700">
          <span className="flex h-10 items-center gap-2">
            <input
              type="checkbox"
              checked={comFalhados}
              onChange={(e) => setComFalhados(e.target.checked)}
              className="h-4 w-4"
            />
            Incluir os que falharam
          </span>
        </label>
      </div>

      {diasComAlgo.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Dias com movimento:</span>
          {diasComAlgo.map(([d, quantos]) => (
            <button
              key={d}
              type="button"
              onClick={() => setDia(d)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
                d === dia
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-600 ring-slate-300 hover:ring-slate-500"
              }`}
            >
              {d.slice(8)}/{d.slice(5, 7)}
              <span className="ml-1 opacity-70">{quantos}</span>
            </button>
          ))}
        </div>
      )}

      {/* --------------------------------------------------------- RESUMO */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { r: "Emails", v: resumo.total, i: Mail },
          { r: "Pessoas", v: resumo.pessoas, i: Users },
          { r: "Encontros", v: resumo.encontros, i: CalendarSearch },
          { r: "Falharam", v: resumo.falhados, i: MailWarning },
        ].map(({ r, v, i: Icone }) => (
          <div key={r} className="rounded-lg border bg-white px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icone className="h-3.5 w-3.5" aria-hidden />
              {r}
            </p>
            <p
              className={`text-xl font-bold tabular-nums ${
                r === "Falharam" && v > 0 ? "text-rose-600" : "text-slate-900"
              }`}
            >
              {v}
            </p>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------------- LISTA */}
      {linhas.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
          {criterio === "marcado"
            ? "Não há ninguém convocado para este dia."
            : "Não saiu nenhum email neste dia."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Candidato</th>
                <th scope="col" className="py-2 pr-3 font-medium">Email</th>
                <th scope="col" className="py-2 pr-3 font-medium">Tipo</th>
                <th scope="col" className="py-2 pr-3 font-medium">Encontro</th>
                <th scope="col" className="py-2 font-medium">Saiu</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const fase = l.evento ? DEFINICOES_FASE[l.evento.fase as Fase] : null;
                return (
                  <tr key={l.email.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/admin/candidato/${l.email.candidatoId}`}
                        className="font-medium hover:text-consulvolt-vermelho hover:underline"
                      >
                        {nomePorCandidato[l.email.candidatoId] ?? "Candidato"}
                      </Link>
                      {l.email.estado === "erro" && (
                        <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                          FALHOU
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{l.email.destinatario}</td>
                    <td className="py-2 pr-3 text-xs">
                      {ETIQUETAS_EMAIL[l.email.tipo as keyof typeof ETIQUETAS_EMAIL] ?? l.email.tipo}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {l.evento ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          {fase && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                              style={{ backgroundColor: fase.cor }}
                            >
                              {fase.rotulo}
                            </span>
                          )}
                          <span className="tabular-nums">
                            {diaEmAngola(l.evento.quando)?.slice(8)}/
                            {diaEmAngola(l.evento.quando)?.slice(5, 7)} às{" "}
                            {horaEmAngola(l.evento.quando)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">sem encontro</span>
                      )}
                    </td>
                    <td className="py-2 text-xs tabular-nums text-muted-foreground">
                      {diaEmAngola(l.email.enviadoEm)?.slice(8)}/
                      {diaEmAngola(l.email.enviadoEm)?.slice(5, 7)} {horaEmAngola(l.email.enviadoEm)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
