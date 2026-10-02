-- ============================================================================
-- CONSULVOLT - Recrutamento Bengo
-- Migração: utilizadores do painel com papéis, e fases de comunicação
--
-- PURAMENTE ADITIVA. Não apaga nem altera nenhum dado existente.
-- Seguro de correr mais que uma vez.
--
-- O que faz:
--   1. cria a tabela utilizadores_painel (admin, gestor, editor, visualizador)
--   2. cria a tabela eventos_candidato (entrevista, formação, teste, reunião)
--   3. alarga o CHECK do tipo em emails_enviados para as fases novas
-- ============================================================================

-- 1. UTILIZADORES DO PAINEL --------------------------------------------------
--    O par ADMIN_USER/ADMIN_PASS das variáveis de ambiente continua a
--    funcionar como administrador de recurso, para ninguém ficar fechado
--    fora do sistema se apagar o último admin desta tabela por engano.
create table if not exists public.utilizadores_painel (
  id                  uuid primary key default gen_random_uuid(),
  criado_em           timestamptz not null default now(),

  utilizador          text not null unique,
  nome                text not null,
  email               text,

  papel               text not null default 'visualizador'
                        check (papel in ('admin', 'gestor', 'editor', 'visualizador')),

  -- PBKDF2-SHA256, guardado como "iteracoes.sal.derivada" em base64url.
  -- Nunca guardamos a palavra-passe em claro, nem sequer cifrada de forma
  -- reversível: o painel só precisa de saber se ela confere.
  palavra_passe_hash  text not null,

  activo              boolean not null default true,
  criado_por          text,
  ultimo_acesso       timestamptz
);

create index if not exists idx_utilizadores_activos
  on public.utilizadores_painel (utilizador)
  where activo;

comment on table public.utilizadores_painel is
  'Contas de acesso ao painel de recrutamento, com o papel que define as permissões';

alter table public.utilizadores_painel enable row level security;
-- Sem policies de propósito: só a service_role, que corre no servidor da
-- aplicação, lê e escreve aqui. O browser nunca toca nesta tabela.

-- 2. FASES DO PROCESSO -------------------------------------------------------
--    A entrevista já vivia em colunas de candidatos e continua a viver lá,
--    para nada partir. Esta tabela guarda TODAS as marcações, incluindo as
--    entrevistas, e é o que permite marcar em massa e ter histórico.
create table if not exists public.eventos_candidato (
  id             uuid primary key default gen_random_uuid(),
  criado_em      timestamptz not null default now(),

  candidato_id   uuid not null references public.candidatos(id) on delete cascade,

  fase           text not null check (fase in (
                   'entrevista',   -- entrevista de selecção
                   'formacao',     -- formação, com local e data
                   'teste_fluxo',  -- teste de fluxo no terreno
                   'reuniao'       -- reunião de trabalho
                 )),

  quando         timestamptz not null,
  local          text not null,
  observacoes    text,

  email_enviado  boolean not null default false,
  criado_por     text
);

create index if not exists idx_eventos_candidato on public.eventos_candidato (candidato_id);
create index if not exists idx_eventos_quando    on public.eventos_candidato (quando);
create index if not exists idx_eventos_fase      on public.eventos_candidato (fase);

comment on table public.eventos_candidato is
  'Marcações por fase do processo: entrevista, formação, teste de fluxo e reunião';

alter table public.eventos_candidato enable row level security;

-- 3. TIPOS DE EMAIL NOVOS ----------------------------------------------------
--    Alargar o CHECK, não substituir a coluna: as linhas antigas continuam
--    todas válidas.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'emails_enviados_tipo_check'
      and conrelid = 'public.emails_enviados'::regclass
  ) then
    alter table public.emails_enviados drop constraint emails_enviados_tipo_check;
  end if;

  alter table public.emails_enviados
    add constraint emails_enviados_tipo_check check (tipo in (
      'confirmacao',
      'aprovacao',
      'entrevista',
      'reprovacao',
      'personalizado',
      'rh',
      'formacao',
      'teste_fluxo',
      'reuniao'
    ));
exception
  when undefined_table then
    raise notice 'A tabela emails_enviados ainda não existe; corre primeiro migracao-entrevistas.sql.';
end $$;

-- ============================================================================
-- FIM
-- ============================================================================
