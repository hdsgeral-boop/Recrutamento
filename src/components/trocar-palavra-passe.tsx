"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trocarMinhaPalavraPasse } from "@/app/admin/accoes-utilizadores";

/**
 * Formulário de troca da palavra-passe.
 *
 * `obrigatorio` muda o tom, não as regras: em qualquer dos casos é preciso a
 * palavra-passe actual, porque um cookie roubado não pode bastar para tomar
 * conta de uma conta.
 */
export function TrocarPalavraPasse({ obrigatorio = false }: { obrigatorio?: boolean }) {
  const router = useRouter();
  const [aGravar, iniciar] = useTransition();
  const [aVer, setAVer] = useState(false);

  const [actual, setActual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  const regras = [
    { texto: "Pelo menos 10 caracteres", ok: nova.length >= 10 },
    { texto: "Pelo menos uma letra", ok: /[a-zA-Z]/.test(nova) },
    { texto: "Pelo menos um algarismo", ok: /\d/.test(nova) },
    { texto: "Diferente da actual", ok: nova.length > 0 && nova !== actual },
    { texto: "As duas iguais", ok: nova.length > 0 && nova === confirmacao },
  ];

  const prontas = regras.every((r) => r.ok) && actual.length > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await trocarMinhaPalavraPasse({ actual, nova, confirmacao });
          if (r.ok) {
            toast.success(r.mensagem);
            setActual("");
            setNova("");
            setConfirmacao("");
            router.replace(obrigatorio ? "/admin" : "/admin/perfil");
            router.refresh();
          } else {
            toast.error(r.mensagem);
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="actual">
          {obrigatorio ? "Palavra-passe que recebeste por email" : "Palavra-passe actual"}
        </Label>
        <Input
          id="actual"
          type={aVer ? "text" : "password"}
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          autoComplete="current-password"
          className="font-mono"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nova">Palavra-passe nova</Label>
        <div className="relative">
          <Input
            id="nova"
            type={aVer ? "text" : "password"}
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            autoComplete="new-password"
            className="pr-10 font-mono"
            required
          />
          <button
            type="button"
            onClick={() => setAVer((v) => !v)}
            aria-label={aVer ? "Esconder" : "Mostrar"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
          >
            {aVer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmacao">Repete a palavra-passe nova</Label>
        <Input
          id="confirmacao"
          type={aVer ? "text" : "password"}
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoComplete="new-password"
          className="font-mono"
          required
        />
      </div>

      <ul className="grid gap-1 rounded-lg border bg-slate-50 p-3 sm:grid-cols-2">
        {regras.map((r) => (
          <li
            key={r.texto}
            className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-emerald-700" : "text-slate-500"}`}
          >
            <ShieldCheck className={`h-3.5 w-3.5 shrink-0 ${r.ok ? "" : "opacity-30"}`} />
            {r.texto}
          </li>
        ))}
      </ul>

      <Button type="submit" className="w-full" disabled={aGravar || !prontas}>
        {aGravar ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {aGravar ? "A gravar…" : "Gravar palavra-passe nova"}
      </Button>
    </form>
  );
}
