"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { analisarLote, listarPorAnalisar } from "@/app/admin/accoes-analise";

/**
 * Analisa, em ciclo, tudo o que está por analisar ou desactualizado.
 *
 * O ciclo vive aqui, no browser, e não no servidor: cada pedido trata de três
 * candidaturas e volta depressa, o que respeita o tempo máximo de execução do
 * plano Hobby da Vercel e ainda dá uma barra de progresso a sério em vez de
 * um botão parado durante minutos.
 *
 * Se o utilizador fechar a página a meio, o que já foi analisado fica
 * gravado: a próxima passagem continua de onde esta parou.
 */
export function BotaoAnalisarTodos({ quantos }: { quantos: number }) {
  const router = useRouter();
  const [aCorrer, setACorrer] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [total, setTotal] = useState(quantos);

  const correr = useCallback(async () => {
    setACorrer(true);
    setFeitos(0);

    try {
      const ids = await listarPorAnalisar();
      setTotal(ids.length);

      if (ids.length === 0) {
        toast.success("Está tudo analisado com a versão actual.");
        router.refresh();
        return;
      }

      toast.info(`A analisar ${ids.length} candidatura(s). Podes ficar nesta página.`);

      let contados = 0;
      let falhas = 0;

      for (let i = 0; i < ids.length; i += 3) {
        const r = await analisarLote(ids.slice(i, i + 3));
        contados += r.feitos;
        falhas += r.falhados;
        setFeitos(contados + falhas);

        // Uma pausa curta evita levar com o limite de pedidos da API do Drive
        // quando há muitos documentos por ler pela primeira vez.
        if (i + 3 < ids.length) await new Promise((r) => setTimeout(r, 250));
      }

      falhas === 0
        ? toast.success(`${contados} candidatura(s) analisadas.`)
        : toast.warning(`${contados} analisadas, ${falhas} falharam. Vê os alertas na ficha.`);

      router.refresh();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "A análise foi interrompida.");
    } finally {
      setACorrer(false);
    }
  }, [router]);

  const percentagem = total > 0 ? Math.round((feitos / total) * 100) : 0;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button disabled={aCorrer} onClick={correr}>
        {aCorrer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {aCorrer ? `A analisar ${feitos} de ${total}…` : `Analisar ${quantos} candidatura(s)`}
      </Button>

      {aCorrer && (
        <div className="h-1 w-44 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-consulvolt-vermelho transition-all duration-300"
            style={{ width: `${percentagem}%` }}
          />
        </div>
      )}
    </div>
  );
}
