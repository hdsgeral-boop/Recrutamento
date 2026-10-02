"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, MailQuestion, Phone, PhoneOff, Video, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

import { registarEscolhaDoCandidato, registarTentativa } from "@/app/admin/accoes-chamada";
import {
  DEFINICAO_POR_ESCOLHER,
  DEFINICOES_MODALIDADE,
  MODALIDADES,
  POR_ESCOLHER,
  type ModalidadeGravada,
  MAXIMO_TENTATIVAS,
  RESULTADOS_CHAMADA,
  rotuloDoResultado,
  situacaoDaChamada,
  type LinhaTentativa,
  type Modalidade,
  type ResultadoChamada,
} from "@/lib/entrevista/modalidade";
import { dataHora } from "@/lib/datas";

/**
 * ===========================================================================
 * AS TENTATIVAS DE CHAMADA, NA FICHA DO CANDIDATO
 * ---------------------------------------------------------------------------
 * Mostra em que ponto está e deixa registar a tentativa seguinte. O contador
 * que manda é o do servidor: o que aqui se vê é o que ele devolveu na última
 * resposta, nunca uma conta feita no browser.
 *
 * Quando as três se esgotam, o botão desaparece e fica escrito porquê. Não é
 * só o botão que some - a acção do servidor recusa na mesma, e é ela que
 * conta.
 * ===========================================================================
 */

export function TentativasChamada({
  candidatoId,
  modalidade,
  link,
  tentativasIniciais,
  atendeuInicial,
  historico,
  podeRegistar,
}: {
  candidatoId: string;
  modalidade: ModalidadeGravada | null;
  link: string | null;
  tentativasIniciais: number;
  atendeuInicial: boolean;
  historico: LinhaTentativa[];
  podeRegistar: boolean;
}) {
  const [tentativas, setTentativas] = useState(tentativasIniciais);
  const [atendeu, setAtendeu] = useState(atendeuInicial);
  const [lista, setLista] = useState(historico);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [aGravar, gravar] = useTransition();
  const router = useRouter();

  // Sem modalidade não há nada para mostrar: é uma marcação anterior a esta
  // funcionalidade, e funciona como sempre funcionou.
  if (!modalidade) return null;

  /* ---------------------------------------------- À ESPERA DA ESCOLHA */
  if (modalidade === POR_ESCOLHER) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${DEFINICAO_POR_ESCOLHER.crachá}`}>
            <MailQuestion className="h-3.5 w-3.5" aria-hidden />
            {DEFINICAO_POR_ESCOLHER.rotulo}
          </span>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-sky-700 hover:underline"
            >
              sala já reservada
            </a>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {DEFINICAO_POR_ESCOLHER.explicacao} Quando a resposta chegar, regista aqui o que ele
          escolheu.
        </p>

        {podeRegistar && (
          <div className="flex flex-wrap gap-1.5">
            {MODALIDADES.map((k) => (
              <Button
                key={k}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={aGravar}
                onClick={() =>
                  gravar(async () => {
                    setRecado(null);
                    const r = await registarEscolhaDoCandidato(candidatoId, k);
                    setRecado({ ok: r.ok, texto: r.mensagem });
                    if (r.ok) router.refresh();
                  })
                }
              >
                {aGravar ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                ) : k === "videochamada" ? (
                  <Video className="mr-1 h-3 w-3" aria-hidden />
                ) : (
                  <Phone className="mr-1 h-3 w-3" aria-hidden />
                )}
                Escolheu {DEFINICOES_MODALIDADE[k].rotulo.toLowerCase()}
              </Button>
            ))}
          </div>
        )}

        {recado && (
          <p
            className={`flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${
              recado.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
            }`}
            role="status"
          >
            {recado.ok ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            {recado.texto}
          </p>
        )}
      </div>
    );
  }

  const d = DEFINICOES_MODALIDADE[modalidade];
  const s = situacaoDaChamada(modalidade, tentativas, atendeu);

  /* ------------------------------------------------------ VIDEOCHAMADA */
  if (modalidade === "videochamada") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${d.crachá}`}>
          <Video className="h-3.5 w-3.5" aria-hidden />
          {d.rotulo}
        </span>
        {link ? (
          <>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
            >
              <Video className="h-3.5 w-3.5" aria-hidden />
              Entrar na sala
            </a>
            {/* O endereço à vista, para se poder copiar e mandar por WhatsApp
                quando o candidato diz que não encontra o email. */}
            <span className="w-full break-all text-[11px] text-muted-foreground">{link}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">sem sala criada</span>
        )}
      </div>
    );
  }

  /* ---------------------------------------------------------- CHAMADA */
  const registar = (resultado: ResultadoChamada) =>
    gravar(async () => {
      setRecado(null);
      const r = await registarTentativa(candidatoId, resultado);
      setRecado({ ok: r.ok, texto: r.mensagem });
      if (r.ok) {
        setTentativas(r.tentativas);
        setAtendeu(resultado === "atendeu");
        setLista((antes) => [
          ...antes,
          {
            numero: r.tentativas,
            quando: new Date().toISOString(),
            resultado,
            quem: null,
            observacoes: null,
          },
        ]);
      }
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${d.crachá}`}>
          <Phone className="h-3.5 w-3.5" aria-hidden />
          {d.rotulo}
        </span>

        {/* Três pontos: o estado das três tentativas, de relance. */}
        <span className="flex items-center gap-1" aria-label={s.texto}>
          {Array.from({ length: MAXIMO_TENTATIVAS }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full ${
                i < tentativas
                  ? atendeu && i === tentativas - 1
                    ? "bg-emerald-500"
                    : "bg-rose-500"
                  : "bg-slate-200"
              }`}
              aria-hidden
            />
          ))}
        </span>

        <span
          className={`text-xs ${
            s.estado === "esgotado"
              ? "font-semibold text-rose-700"
              : s.estado === "atendeu"
                ? "font-semibold text-emerald-700"
                : "text-muted-foreground"
          }`}
        >
          {s.texto}
        </span>
      </div>

      {lista.length > 0 && (
        <ol className="space-y-1 text-xs text-muted-foreground">
          {lista.map((t) => (
            <li key={`${t.numero}-${t.quando}`} className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-700">{t.numero}.ª</span>
              <span>{rotuloDoResultado(t.resultado)}</span>
              <span>· {dataHora(t.quando)}</span>
              {t.quem && <span>· {t.quem}</span>}
            </li>
          ))}
        </ol>
      )}

      {podeRegistar && s.estado !== "esgotado" && s.estado !== "atendeu" && (
        <div className="flex flex-wrap gap-1.5">
          {RESULTADOS_CHAMADA.map((r) => (
            <Button
              key={r.chave}
              type="button"
              variant={r.chave === "atendeu" ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              disabled={aGravar}
              onClick={() => registar(r.chave)}
            >
              {aGravar ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
              ) : r.chave === "atendeu" ? (
                <Check className="mr-1 h-3 w-3" aria-hidden />
              ) : (
                <PhoneOff className="mr-1 h-3 w-3" aria-hidden />
              )}
              {r.rotulo}
            </Button>
          ))}
        </div>
      )}

      {s.estado === "esgotado" && (
        <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-900 ring-1 ring-rose-200">
          Foram feitas as {MAXIMO_TENTATIVAS} chamadas e o candidato não atendeu.{" "}
          <strong>O sistema não deixa remarcar</strong> - foi a condição que ele aceitou ao
          escolher chamada telefónica.
        </p>
      )}

      {recado && (
        <p
          className={`flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${
            recado.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
          }`}
          role="status"
        >
          {recado.ok ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          {recado.texto}
        </p>
      )}
    </div>
  );
}
