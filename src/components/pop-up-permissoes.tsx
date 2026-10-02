"use client";

import { Check, Minus, ShieldQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CAPACIDADES, DEFINICOES, PAPEIS, pode } from "@/lib/permissoes";

/**
 * O quadro completo de quem pode fazer o quê.
 *
 * Está num pop-up e não na página porque é uma consulta ocasional: quem gere
 * contas precisa disto uma vez, quando decide o papel de alguém, e depois
 * quer a lista de contas sem ruído à frente.
 *
 * Em ecrã largo é uma matriz, que se lê de uma vez. Em telemóvel a matriz de
 * sete colunas seria ilegível, por isso vira uma lista por papel.
 */
export function PopUpPermissoes() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ShieldQuestion className="h-4 w-4" />
          Permissões
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>O que cada papel pode fazer</DialogTitle>
          <DialogDescription>
            As permissões são fixas: não se atribuem uma a uma, escolhe-se o papel. Assim ninguém
            fica com uma combinação estranha que depois ninguém sabe explicar.
          </DialogDescription>
        </DialogHeader>

        {/* --------------------------------------------- MATRIZ, ECRÃ LARGO */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-3 text-left text-xs font-medium text-muted-foreground">
                  Pode
                </th>
                {PAPEIS.map((p) => (
                  <th key={p} className="px-2 py-2 text-center">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DEFINICOES[p].cor}`}
                    >
                      {DEFINICOES[p].rotulo}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPACIDADES.map((c) => (
                <tr key={c.chave} className="border-b last:border-0">
                  <td className="py-2.5 pr-3">
                    <p className="font-medium">{c.rotulo}</p>
                    <p className="text-xs leading-snug text-muted-foreground">{c.explicacao}</p>
                  </td>
                  {PAPEIS.map((p) => (
                    <td key={p} className="px-2 text-center">
                      {pode(p, c.chave) ? (
                        <Check
                          className="mx-auto h-4 w-4 text-emerald-600"
                          aria-label="pode"
                        />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-slate-300" aria-label="não pode" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ------------------------------------------ LISTA, ECRÃ ESTREITO */}
        <div className="space-y-3 md:hidden">
          {PAPEIS.map((p) => (
            <div key={p} className="rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-slate-50 px-3 py-2">
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DEFINICOES[p].cor}`}
                >
                  {DEFINICOES[p].rotulo}
                </span>
              </div>
              <p className="px-3 pt-2 text-xs leading-relaxed text-muted-foreground">
                {DEFINICOES[p].descricao}
              </p>
              <ul className="space-y-1 px-3 py-2.5">
                {CAPACIDADES.map((c) => (
                  <li
                    key={c.chave}
                    className={`flex items-center gap-2 text-xs ${
                      pode(p, c.chave) ? "text-foreground" : "text-slate-400 line-through"
                    }`}
                  >
                    {pode(p, c.chave) ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <Minus className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    )}
                    {c.rotulo}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-muted-foreground">
          {PAPEIS.map((p) => (
            <p key={p} className="hidden md:block">
              <strong className="text-foreground">{DEFINICOES[p].rotulo}:</strong>{" "}
              {DEFINICOES[p].descricao}
            </p>
          ))}
          <p>
            Mudar o papel de alguém faz efeito quando essa pessoa voltar a entrar, no máximo 12
            horas depois. Para que mude já, desactiva e reactiva a conta.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
