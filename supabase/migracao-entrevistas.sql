-- ============================================================================
-- MIGRAÇÃO - entrevistas e registo de comunicações
--
-- Corre no SQL Editor do Supabase ANTES de o novo código entrar no ar.
-- Acrescenta:
--   + colunas da entrevista na tabela candidatos
--   + tabela emails_enviados, o histórico do que saiu para cada candidato
-- Seguro de correr mais que uma vez.
-- ============================================================================

-- 1. Dados da entrevista ------------------------------------------------------
alter table public.candidatos
  add column if not exists entrevista_em     timestamptz,
  add column if not exists entrevista_local  text,
  add column if not exists entrevista_notas  text;

comment on column public.candidatos.entrevista_em is
  'Data e hora marcadas para a entrevista';
comment on column public.candidatos.entrevista_local is
  'Onde se realiza a entrevista, tal como aparece no email ao candidato';
comment on column public.candidatos.entrevista_notas is
  'Indicações para o candidato: o que levar, com quem falar, como chegar';

create index if not exists idx_candidatos_entrevista
  on public.candidatos (entrevista_em)
  where entrevista_em is not null;

-- 2. Histórico de emails ------------------------------------------------------
--    Sem isto, ninguém sabe o que já foi dito a quem - e acabam por sair
--    emails repetidos ou nenhum.
create table if not exists public.emails_enviados (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  candidato_id  uuid not null references public.candidatos(id) on delete cascade,

  tipo          text not null check (tipo in (
                  'confirmacao',   -- recebemos a tua candidatura
                  'aprovacao',     -- foste seleccionado, com ou sem entrevista
                  'entrevista',    -- remarcação ou lembrete de entrevista
                  'reprovacao',    -- não foste seleccionado
                  'personalizado', -- mensagem escrita à mão pelo RH
                  'rh'             -- aviso interno para a equipa
                )),

  destinatario  text not null,
  assunto       text not null,
  resumo        text,                  -- primeiras linhas, para o painel mostrar
  estado        text not null default 'enviado' check (estado in ('enviado','erro')),
  erro          text,
  enviado_por   text                   -- utilizador do painel, quando é manual
);

create index if not exists idx_emails_candidato on public.emails_enviados (candidato_id, created_at desc);
create index if not exists idx_emails_created   on public.emails_enviados (created_at desc);
create index if not exists idx_emails_tipo      on public.emails_enviados (tipo);

alter table public.emails_enviados enable row level security;

drop policy if exists "autenticados_leem_emails" on public.emails_enviados;
create policy "autenticados_leem_emails"
  on public.emails_enviados for select to authenticated using (true);

-- O registo é escrito sempre pela service_role, do lado do servidor.
-- Não há política de INSERT para anon de propósito.

-- 3. Vista de apoio: próximas entrevistas -------------------------------------
drop view if exists public.vw_proximas_entrevistas;
create view public.vw_proximas_entrevistas as
select
  id, nome, telefone, email, provincia, municipio, status,
  entrevista_em, entrevista_local, entrevista_notas
from public.candidatos
where entrevista_em is not null
order by entrevista_em;

-- ============================================================================
-- FIM
-- ============================================================================
