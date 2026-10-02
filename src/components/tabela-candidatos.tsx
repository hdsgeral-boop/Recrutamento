"use client";

import Link from "next/link";
import { Eye, FolderOpen, Inbox } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BotaoDocumentos, BotaoEstado, BotaoWhatsApp } from "@/components/accoes-candidato";
import { varianteDoEstado } from "@/lib/constantes";
import type { Candidato } from "@/types/database";

import { dataMuitoCurta as dataCurta } from "@/lib/datas";

/** Etiquetas curtas que resumem o perfil sem abrir a ficha. */
function Etiquetas({ c }: { c: Candidato }) {
  return (
    <div className="flex flex-wrap items-center gap-1 pt-1">
      <span className="text-xs text-muted-foreground">{c.bi}</span>
      {c.conhece_mtbt && (
        <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
          MT/BT
        </span>
      )}
      {c.tem_carta && (
        <span className="rounded bg-sky-100 px-1.5 text-[10px] font-semibold text-sky-800">
          CARTA
        </span>
      )}
      {c.experiencia_similar && (
        <span className="rounded bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-800">
          EXPERIÊNCIA
        </span>
      )}
    </div>
  );
}

/** As acções de uma linha. `compacto` esconde os rótulos e deixa só os ícones. */
function Accoes({
  c,
  podeEditar,
  compacto,
  estados,
}: {
  c: Candidato;
  podeEditar: boolean;
  compacto?: boolean;
  estados?: readonly string[];
}) {
  return (
    <div className={compacto ? "flex flex-wrap gap-1.5" : "flex flex-wrap justify-end gap-1.5"}>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/admin/candidato/${c.id}`}>
          <Eye className="h-4 w-4" />
          Detalhes
        </Link>
      </Button>

      {c.drive_folder_url && (
        <Button asChild variant="ghost" size="sm">
          <a href={c.drive_folder_url} target="_blank" rel="noopener noreferrer">
            <FolderOpen className="h-4 w-4" />
            Drive
          </a>
        </Button>
      )}

      <BotaoDocumentos candidato={c} />
      {podeEditar && <BotaoEstado candidato={c} estados={estados} />}
      <BotaoWhatsApp candidato={c} />
    </div>
  );
}

/**
 * A lista de candidaturas.
 *
 * Em ecrã largo é uma tabela. Em telemóvel é uma lista de cartões: uma tabela
 * de seis colunas num ecrã de 360px obriga a arrastar para o lado para ver o
 * nome da pessoa, e ninguém trabalha assim.
 */
export function TabelaCandidatos({
  candidatos,
  podeEditar = true,
  estados,
}: {
  candidatos: Candidato[];
  podeEditar?: boolean;
  /** Os estados configurados em Definições. */
  estados?: readonly string[];
}) {
  if (candidatos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-white py-16 text-center">
        <Inbox className="h-8 w-8 text-slate-300" />
        <p className="max-w-xs text-sm text-muted-foreground">
          Ainda não há candidaturas que correspondam aos filtros escolhidos.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ------------------------------------------------ TELEMÓVEL ------- */}
      <ul className="divide-y overflow-hidden rounded-xl border bg-white md:hidden">
        {candidatos.map((c) => (
          <li key={c.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/admin/candidato/${c.id}`}
                  className="block truncate font-medium hover:text-consulvolt-vermelho hover:underline"
                >
                  {c.nome}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {c.municipio} · {c.provincia}
                </p>
              </div>
              <Badge variant={varianteDoEstado(c.status)} className="shrink-0">
                {c.status}
              </Badge>
            </div>

            <Etiquetas c={c} />

            <p className="mt-1 text-xs text-muted-foreground">
              +{c.telefone} · {dataCurta(c.created_at)}
            </p>

            <div className="mt-2 border-t pt-2">
              <Accoes c={c} podeEditar={podeEditar} estados={estados} compacto />
            </div>
          </li>
        ))}
      </ul>

      {/* ------------------------------------------------ ECRÃ LARGO ------ */}
      <div className="hidden rounded-xl border bg-white md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-[86px]">Data</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden lg:table-cell">Província / Município</TableHead>
              <TableHead className="hidden xl:table-cell">Telefone</TableHead>
              <TableHead className="w-[110px]">Estado</TableHead>
              <TableHead className="min-w-[240px] text-right">Acções</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {candidatos.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {dataCurta(c.created_at)}
                </TableCell>

                <TableCell>
                  <Link
                    href={`/admin/candidato/${c.id}`}
                    className="font-medium hover:text-consulvolt-vermelho hover:underline"
                  >
                    {c.nome}
                  </Link>
                  <Etiquetas c={c} />
                  <div className="text-xs text-muted-foreground lg:hidden">
                    {c.provincia} / {c.municipio}
                  </div>
                </TableCell>

                <TableCell className="hidden lg:table-cell">
                  <span className="font-medium">{c.municipio}</span>
                  <span className="block text-xs text-muted-foreground">{c.provincia}</span>
                </TableCell>

                <TableCell className="hidden whitespace-nowrap xl:table-cell">
                  +{c.telefone}
                </TableCell>

                <TableCell>
                  <Badge variant={varianteDoEstado(c.status)}>{c.status}</Badge>
                </TableCell>

                <TableCell>
                  <Accoes c={c} podeEditar={podeEditar} estados={estados} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
