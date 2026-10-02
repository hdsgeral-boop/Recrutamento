-- ===========================================================================
-- COMO SE FAZ A ENTREVISTA: videochamada ou chamada telefónica
-- ---------------------------------------------------------------------------
-- Só ACRESCENTA. Nada se apaga, nada muda de tipo, e correr duas vezes é
-- seguro.
--
-- As entrevistas marcadas antes disto ficam com a modalidade a nulo, que se
-- lê como "à maneira antiga": remarcam-se normalmente e não contam tentativas
-- nenhumas. Nenhuma marcação que já exista muda de comportamento.
-- ===========================================================================

-- --------------------------------------------------------------- CANDIDATOS
alter table public.candidatos
  add column if not exists entrevista_modalidade text,
  add column if not exists entrevista_link       text,
  add column if not exists chamada_tentativas    integer not null default 0,
  add column if not exists chamada_atendeu       boolean not null default false;

comment on column public.candidatos.entrevista_modalidade is
  'videochamada (Google Meet) ou chamada (telefone). Nulo = marcação anterior a esta funcionalidade.';
comment on column public.candidatos.entrevista_link is
  'Link da videochamada enviado ao candidato. Só se preenche na modalidade videochamada.';
comment on column public.candidatos.chamada_tentativas is
  'Quantas vezes já se ligou. Ao chegar a 3 sem atender, NÃO há remarcação - a regra vive em src/lib/entrevista/modalidade.ts e é conferida no servidor.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'candidatos_modalidade_valida') then
    alter table public.candidatos
      add constraint candidatos_modalidade_valida
      check (entrevista_modalidade is null or entrevista_modalidade in ('videochamada','chamada'));
  end if;

  -- Um contador nunca é negativo, e passar de três é sinal de que alguma
  -- coisa escreveu à revelia da regra. A base recusa as duas coisas.
  if not exists (select 1 from pg_constraint where conname = 'candidatos_tentativas_ate_tres') then
    alter table public.candidatos
      add constraint candidatos_tentativas_ate_tres
      check (chamada_tentativas between 0 and 3);
  end if;
end $$;

-- ------------------------------------------------------------------ EVENTOS
-- A marcação guarda a modalidade com que foi feita. Sem isto, mudar a
-- modalidade de um candidato reescrevia a história das marcações anteriores.
alter table public.eventos_candidato
  add column if not exists modalidade text,
  add column if not exists link       text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eventos_modalidade_valida') then
    alter table public.eventos_candidato
      add constraint eventos_modalidade_valida
      check (modalidade is null or modalidade in ('videochamada','chamada'));
  end if;
end $$;

-- ------------------------------------------------- REGISTO DAS TENTATIVAS
-- Append-only. O contador em `candidatos` responde depressa à pergunta
-- "quantas já foram?"; esta tabela responde à pergunta que vem a seguir, e
-- que é a que interessa quando alguém reclama: "quem ligou, quando, e o que
-- aconteceu?". Um número sozinho não se defende; uma lista defende-se.
create table if not exists public.tentativas_chamada (
  id           uuid primary key default gen_random_uuid(),
  quando       timestamptz not null default now(),
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  numero       integer not null check (numero between 1 and 3),
  resultado    text not null check (resultado in (
                 'atendeu','nao_atendeu','desligado','numero_errado','pediu_para_ligar_depois'
               )),
  quem         text,
  observacoes  text
);

create index if not exists idx_tentativas_candidato
  on public.tentativas_chamada (candidato_id, numero);

comment on table public.tentativas_chamada is
  'Cada tentativa de chamada, uma linha. Nada aqui se altera nem se apaga.';

alter table public.tentativas_chamada enable row level security;
