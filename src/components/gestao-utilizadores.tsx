"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ClipboardList,
  KeyRound,
  Loader2,
  MailCheck,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  activarConta,
  actualizarDados,
  apagarConta,
  criarConta,
  pedirNovaPalavraPasse,
} from "@/app/admin/accoes-utilizadores";
import { DEFINICOES, PAPEIS, podeSerRecrutador, type Papel } from "@/lib/permissoes";
import { definirRecrutador } from "@/app/admin/accoes-atribuicao";
import { dataCurta } from "@/lib/datas";

/**
 * ===========================================================================
 * GESTÃO DAS CONTAS
 * ---------------------------------------------------------------------------
 * Criar, procurar, editar, repor palavra-passe, desactivar e apagar.
 *
 * O que NÃO existe aqui, de propósito: nenhum campo de palavra-passe. Quem
 * cria a conta não escolhe a palavra-passe nem a chega a ver - o sistema
 * gera-a e manda-a por email à pessoa. É o que impede um administrador de
 * entrar na conta de outra pessoa e agir em nome dela.
 * ===========================================================================
 */

export interface ContaNaLista {
  id: string;
  utilizador: string;
  nome: string;
  email: string;
  telefone: string | null;
  papel: Papel;
  /** Função temporária de recrutador. Independente do papel. */
  e_recrutador: boolean;
  activo: boolean;
  criado_em: string;
  ultimo_acesso: string | null;
  deve_trocar_palavra_passe: boolean;
  credenciais_enviadas_em: string | null;
}

const data = (iso: string | null) => (iso ? dataCurta(iso) : "nunca");

// --------------------------------------------------------------- NOVA CONTA

function DialogoNovaConta({
  aberto,
  fechar,
}: {
  aberto: boolean;
  fechar: () => void;
}) {
  const router = useRouter();
  const [aGravar, iniciar] = useTransition();

  const [utilizador, setUtilizador] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [papel, setPapel] = useState<Papel>("visualizador");

  const limpar = () => {
    setUtilizador("");
    setNome("");
    setEmail("");
    setTelefone("");
    setPapel("visualizador");
  };

  /** Sugere o utilizador a partir do nome: "Maria Silva" -> "maria.silva". */
  const sugerirUtilizador = (valor: string) => {
    if (utilizador) return;
    const partes = valor
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/\s+/)
      .filter(Boolean);
    if (partes.length >= 2) setUtilizador(`${partes[0]}.${partes[partes.length - 1]}`);
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conta de acesso</DialogTitle>
          <DialogDescription>
            A palavra-passe é gerada pelo sistema e enviada para o email da pessoa. Não a escolhes
            nem a vês - nem tu nem mais ninguém da equipa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="n">Nome da pessoa</Label>
            <Input
              id="n"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onBlur={(e) => sugerirUtilizador(e.target.value)}
              placeholder="Maria Silva"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u">Nome de utilizador</Label>
            <Input
              id="u"
              value={utilizador}
              onChange={(e) => setUtilizador(e.target.value.toLowerCase())}
              placeholder="maria.silva"
              autoComplete="off"
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t">Telefone</Label>
            <Input
              id="t"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="244923000000"
              inputMode="tel"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="e">
              Email <span className="text-consulvolt-vermelho">*</span>
            </Label>
            <Input
              id="e"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria.silva@exemplo.ao"
              required
            />
            <p className="text-xs text-muted-foreground">
              Obrigatório: é para aqui que segue a palavra-passe. Confirma antes de gravar.
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Papel</Label>
            <Select value={papel} onValueChange={(v) => setPapel(v as Papel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPEIS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {DEFINICOES[p].rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="rounded-lg bg-slate-50 p-2.5 text-xs leading-snug text-muted-foreground">
              {DEFINICOES[papel].descricao}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={fechar} disabled={aGravar}>
            Cancelar
          </Button>
          <Button
            disabled={aGravar || !nome || !utilizador || !email}
            onClick={() =>
              iniciar(async () => {
                const r = await criarConta({ utilizador, nome, email, telefone, papel });
                if (r.ok) {
                  toast.success(r.mensagem);
                  limpar();
                  fechar();
                  router.refresh();
                } else {
                  toast.error(r.mensagem);
                }
              })
            }
          >
            {aGravar ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MailCheck className="h-4 w-4" />
            )}
            Criar e enviar credenciais
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------- EDITAR CONTA

function DialogoEditar({ conta, fechar }: { conta: ContaNaLista | null; fechar: () => void }) {
  const router = useRouter();
  const [aGravar, iniciar] = useTransition();

  const [nome, setNome] = useState(conta?.nome ?? "");
  const [email, setEmail] = useState(conta?.email ?? "");
  const [telefone, setTelefone] = useState(conta?.telefone ?? "");
  const [papel, setPapel] = useState<Papel>(conta?.papel ?? "visualizador");

  if (!conta) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {conta.nome}</DialogTitle>
          <DialogDescription>
            O nome de utilizador <span className="font-mono">{conta.utilizador}</span> não muda: é
            por ele que a pessoa entra e é o que fica no registo do que foi feito.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="en">Nome</Label>
            <Input id="en" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ee">Email</Label>
            <Input id="ee" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="et">Telefone</Label>
            <Input id="et" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Papel</Label>
            <Select value={papel} onValueChange={(v) => setPapel(v as Papel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPEIS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {DEFINICOES[p].rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="rounded-lg bg-slate-50 p-2.5 text-xs leading-snug text-muted-foreground">
              {DEFINICOES[papel].descricao}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={fechar} disabled={aGravar}>
            Cancelar
          </Button>
          <Button
            disabled={aGravar || !nome || !email}
            onClick={() =>
              iniciar(async () => {
                const r = await actualizarDados(conta.id, { nome, email, telefone, papel });
                if (r.ok) {
                  toast.success(r.mensagem);
                  fechar();
                  router.refresh();
                } else {
                  toast.error(r.mensagem);
                }
              })
            }
          >
            {aGravar ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Gravar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------- UMA LINHA

function Linha({
  conta,
  souEu,
  editar,
}: {
  conta: ContaNaLista;
  souEu: boolean;
  editar: () => void;
}) {
  const router = useRouter();
  const [aGravar, iniciar] = useTransition();
  const [aApagar, setAApagar] = useState(false);

  const agir = (promessa: Promise<{ ok: boolean; mensagem: string }>) =>
    iniciar(async () => {
      const r = await promessa;
      r.ok ? toast.success(r.mensagem) : toast.error(r.mensagem);
      router.refresh();
    });

  return (
    <li className={cn("p-3 sm:p-4", !conta.activo && "bg-slate-50")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-medium">
            <span className="truncate">{conta.nome}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${DEFINICOES[conta.papel].cor}`}
            >
              {DEFINICOES[conta.papel].rotulo}
            </span>
            {conta.e_recrutador && (
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 ring-1 ring-violet-300">
                Recrutador
              </span>
            )}
            {souEu && (
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                és tu
              </span>
            )}
            {!conta.activo && (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                desactivada
              </span>
            )}
            {conta.activo && conta.deve_trocar_palavra_passe && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                por estrear
              </span>
            )}
          </p>

          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <span className="font-mono">{conta.utilizador}</span> · {conta.email}
            {conta.telefone && ` · +${conta.telefone}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Criada a {data(conta.criado_em)} · último acesso {data(conta.ultimo_acesso)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8" disabled={aGravar} onClick={editar}>
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={aGravar}
            onClick={() => {
              if (
                window.confirm(
                  `Gerar uma palavra-passe nova para ${conta.nome} e enviá-la para ${conta.email}?\n\n` +
                    `A palavra-passe actual deixa de funcionar imediatamente.`
                )
              ) {
                agir(pedirNovaPalavraPasse(conta.id));
              }
            }}
          >
            {aGravar ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            Repor palavra-passe
          </Button>

          {/* A função de recrutador liga-se e desliga-se aqui. Não muda o
              papel: um editor continua editor, e ganha só o direito de
              entrevistar os candidatos que lhe forem atribuídos. */}
          {podeSerRecrutador(conta.papel) && conta.activo && (
            <Button
              variant={conta.e_recrutador ? "default" : "outline"}
              size="sm"
              className={cn("h-8", conta.e_recrutador && "bg-violet-600 hover:bg-violet-700")}
              disabled={aGravar}
              title={
                conta.e_recrutador
                  ? "Tirar a função de recrutador. As atribuições ficam no histórico."
                  : "Dar a função de recrutador, para lhe poderes atribuir candidatos."
              }
              onClick={() => agir(definirRecrutador(conta.utilizador, !conta.e_recrutador))}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              {conta.e_recrutador ? "É recrutador" : "Tornar recrutador"}
            </Button>
          )}

          <Button
            variant={conta.activo ? "outline" : "default"}
            size="sm"
            className="h-8"
            disabled={aGravar}
            onClick={() => agir(activarConta(conta.id, !conta.activo))}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {conta.activo ? "Desactivar" : "Reactivar"}
          </Button>

          {!souEu && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              disabled={aGravar}
              onClick={() => setAApagar(true)}
              aria-label={`Apagar a conta de ${conta.nome}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Apagar pede confirmação escrita: é irreversível. */}
      <Dialog open={aApagar} onOpenChange={setAApagar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apagar a conta de {conta.nome}?</DialogTitle>
            <DialogDescription>
              A conta desaparece e a pessoa deixa de entrar. Os emails que já enviou e as marcações
              que fez ficam no histórico, com o nome dela.
              <br />
              <br />
              Se for só uma saída temporária, <strong>desactivar</strong> é melhor: guarda o
              registo e pode ser revertido.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAApagar(false)} disabled={aGravar}>
              <X className="h-4 w-4" />
              Manter a conta
            </Button>
            <Button
              variant="destructive"
              disabled={aGravar}
              onClick={() =>
                iniciar(async () => {
                  const r = await apagarConta(conta.id);
                  r.ok ? toast.success(r.mensagem) : toast.error(r.mensagem);
                  setAApagar(false);
                  router.refresh();
                })
              }
            >
              {aGravar ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Apagar mesmo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

// ---------------------------------------------------------------- A LISTA

export function GestaoUtilizadores({
  contas,
  euSou,
}: {
  contas: ContaNaLista[];
  euSou: string;
}) {
  const [procura, setProcura] = useState("");
  const [filtroPapel, setFiltroPapel] = useState<string>("todos");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [nova, setNova] = useState(false);
  const [aEditar, setAEditar] = useState<ContaNaLista | null>(null);

  const visiveis = useMemo(() => {
    const termo = procura.trim().toLowerCase();
    return contas.filter((c) => {
      if (filtroPapel !== "todos" && c.papel !== filtroPapel) return false;
      if (filtroEstado === "activas" && !c.activo) return false;
      if (filtroEstado === "desactivadas" && c.activo) return false;
      if (filtroEstado === "por_estrear" && !(c.activo && c.deve_trocar_palavra_passe)) return false;
      if (!termo) return true;
      return (
        c.nome.toLowerCase().includes(termo) ||
        c.utilizador.toLowerCase().includes(termo) ||
        c.email.toLowerCase().includes(termo)
      );
    });
  }, [contas, procura, filtroPapel, filtroEstado]);

  const activas = contas.filter((c) => c.activo).length;
  const porEstrear = contas.filter((c) => c.activo && c.deve_trocar_palavra_passe).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Procurar por nome, utilizador ou email"
            value={procura}
            onChange={(e) => setProcura(e.target.value)}
          />
        </div>

        <Select value={filtroPapel} onValueChange={setFiltroPapel}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os papéis</SelectItem>
            {PAPEIS.map((p) => (
              <SelectItem key={p} value={p}>
                {DEFINICOES[p].rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os estados</SelectItem>
            <SelectItem value="activas">Activas</SelectItem>
            <SelectItem value="desactivadas">Desactivadas</SelectItem>
            <SelectItem value="por_estrear">Por estrear</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={() => setNova(true)}>
          <UserPlus className="h-4 w-4" />
          Nova conta
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {contas.length} conta(s), {activas} activa(s)
        {porEstrear > 0 && (
          <>
            {" · "}
            <strong className="text-amber-700">
              {porEstrear} ainda não entrou pela primeira vez
            </strong>
          </>
        )}
        {visiveis.length !== contas.length && ` · ${visiveis.length} a mostrar`}
      </p>

      {visiveis.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white py-12 text-center text-sm text-muted-foreground">
          {contas.length === 0
            ? "Ainda não há contas criadas. Só está a funcionar o acesso de recurso das variáveis de ambiente."
            : "Nenhuma conta corresponde a esta procura."}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-white">
          {visiveis.map((c) => (
            <Linha
              key={c.id}
              conta={c}
              souEu={c.utilizador === euSou}
              editar={() => setAEditar(c)}
            />
          ))}
        </ul>
      )}

      <DialogoNovaConta aberto={nova} fechar={() => setNova(false)} />
      {aEditar && (
        <DialogoEditar
          key={aEditar.id}
          conta={aEditar}
          fechar={() => setAEditar(null)}
        />
      )}
    </div>
  );
}
