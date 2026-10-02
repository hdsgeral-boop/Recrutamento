"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Lock, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actualizarMeuPerfil } from "@/app/admin/accoes-utilizadores";

/**
 * Os dados que a própria pessoa pode mudar: nome e telefone.
 *
 * O email fica de fora, e não por esquecimento: é por ele que a palavra-passe
 * chega, e deixar cada um mudá-lo sozinho seria uma forma de desviar a conta
 * de outra pessoa. Muda-se pedindo a um administrador.
 */
export function MeusDados({
  nome: nomeInicial,
  telefone: telefoneInicial,
  email,
  utilizador,
}: {
  nome: string;
  telefone: string;
  email: string;
  utilizador: string;
}) {
  const router = useRouter();
  const [aGravar, iniciar] = useTransition();
  const [nome, setNome] = useState(nomeInicial);
  const [telefone, setTelefone] = useState(telefoneInicial);

  const mudou = nome !== nomeInicial || telefone !== telefoneInicial;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await actualizarMeuPerfil({ nome, telefone });
          r.ok ? toast.success(r.mensagem) : toast.error(r.mensagem);
          if (r.ok) router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="perfil-nome">Nome</Label>
          <Input
            id="perfil-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="perfil-telefone">Telefone</Label>
          <Input
            id="perfil-telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="244923000000"
            inputMode="tel"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="perfil-utilizador">Utilizador</Label>
          <Input id="perfil-utilizador" value={utilizador} readOnly disabled className="font-mono" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="perfil-email" className="flex items-center gap-1.5">
            Email
            <Lock className="h-3 w-3 text-muted-foreground" />
          </Label>
          <Input id="perfil-email" value={email} readOnly disabled />
          <p className="text-xs text-muted-foreground">
            É por aqui que as palavras-passe chegam. Para mudar, pede a um administrador.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={aGravar || !mudou}>
        {aGravar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {aGravar ? "A gravar…" : "Gravar alterações"}
      </Button>
    </form>
  );
}
