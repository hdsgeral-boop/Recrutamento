import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-6xl font-bold text-consulvolt-vermelho">404</p>
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        O endereço que abriste não existe ou já foi retirado.
      </p>
      <Button asChild>
        <Link href="/app">Ir para o formulário de candidatura</Link>
      </Button>
    </main>
  );
}
