"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { definirConcursoActivo } from "@/app/admin/accoes-concursos";

export function BotaoActivarConcurso({ slug, nome }: { slug: string; nome: string }) {
  const router = useRouter();
  const [aMudar, startTransition] = useTransition();

  function activar() {
    startTransition(async () => {
      const res = await definirConcursoActivo(slug);
      if (res.ok) {
        toast.success(`Concurso "${nome}" activado!`);
        router.refresh();
      } else {
        toast.error("Erro ao activar concurso", { description: res.mensagem });
      }
    });
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={aMudar}
      onClick={activar}
      className="flex-1 h-8 text-xs font-medium"
    >
      {aMudar ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Check className="mr-1.5 h-3.5 w-3.5" />
      )}
      <span>Activar</span>
    </Button>
  );
}
