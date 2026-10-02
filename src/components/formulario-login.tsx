"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { entrar, type EstadoLogin } from "@/app/admin/accoes-login";

function BotaoEntrar() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
      {pending ? "A verificar…" : "Entrar"}
    </Button>
  );
}

export function FormularioLogin({ voltar }: { voltar: string }) {
  const [estado, accao] = useFormState<EstadoLogin, FormData>(entrar, {});

  return (
    <Card>
      <CardContent className="p-6">
        <form action={accao} className="space-y-4">
          <input type="hidden" name="voltar" value={voltar} />

          <div className="space-y-1.5">
            <Label htmlFor="utilizador">Utilizador</Label>
            <Input id="utilizador" name="utilizador" autoComplete="username" autoFocus required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="palavra_passe">Palavra-passe</Label>
            <Input
              id="palavra_passe"
              name="palavra_passe"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {estado.erro && (
            <div className="flex items-start gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{estado.erro}</span>
            </div>
          )}

          <BotaoEntrar />
        </form>
      </CardContent>
    </Card>
  );
}
