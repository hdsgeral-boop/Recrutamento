import { AlertCircle, KeyRound, UserCog } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MeusDados } from "@/components/meus-dados";
import { TrocarPalavraPasse } from "@/components/trocar-palavra-passe";
import { obterConta, sessaoActual } from "@/lib/utilizadores";
import { DEFINICOES } from "@/lib/permissoes";
import { dataHora } from "@/lib/datas";

export const dynamic = "force-dynamic";

/** Os dados pessoais de quem está ligado. Qualquer papel tem acesso ao seu. */
export default async function Perfil() {
  const sessao = await sessaoActual();
  const conta = sessao ? await obterConta(sessao.utilizador) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Os meus dados</h1>
        <p className="text-sm text-muted-foreground">
          O que a equipa vê sobre ti e a palavra-passe com que entras.
        </p>
      </div>

      {!conta ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="font-semibold text-amber-900">Esta sessão é o acesso de recurso</p>
            <p className="mt-1 text-sm text-amber-800">
              Entraste com o par de variáveis de ambiente, que não é uma conta e por isso não tem
              ficha nem palavra-passe para trocar aqui. Cria uma conta para ti em{" "}
              <strong>Utilizadores</strong> e passa a entrar com ela: é o que deixa rasto de quem
              fez o quê.
            </p>
          </div>
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCog className="h-4 w-4 text-consulvolt-vermelho" />
                Dados pessoais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MeusDados
                nome={conta.nome}
                telefone={conta.telefone ?? ""}
                email={conta.email}
                utilizador={conta.utilizador}
              />

              <dl className="mt-5 grid gap-x-6 gap-y-2 border-t pt-4 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Perfil de acesso</dt>
                  <dd>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DEFINICOES[conta.papel].cor}`}
                    >
                      {DEFINICOES[conta.papel].rotulo}
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Conta criada</dt>
                  <dd>{dataHora(conta.criado_em)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Último acesso</dt>
                  <dd>{conta.ultimo_acesso ? dataHora(conta.ultimo_acesso) : "-"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Palavra-passe alterada</dt>
                  <dd>
                    {conta.palavra_passe_alterada_em
                      ? dataHora(conta.palavra_passe_alterada_em)
                      : "ainda não"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-consulvolt-vermelho" />
                Trocar a palavra-passe
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TrocarPalavraPasse />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
