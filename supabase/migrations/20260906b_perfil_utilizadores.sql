-- ============================================================================
-- CONSULVOLT - Recrutamento Bengo
-- Migração: telefone, troca obrigatória de palavra-passe e registo de envios
--
-- PURAMENTE ADITIVA. Não apaga nem altera nenhum dado existente.
-- Seguro de correr mais que uma vez.
--
-- Corre DEPOIS de 20260906_utilizadores_e_fases.sql.
-- ============================================================================

-- 1. COLUNAS NOVAS EM utilizadores_painel ------------------------------------
alter table public.utilizadores_painel
  add column if not exists telefone                    text,
  add column if not exists deve_trocar_palavra_passe   boolean not null default true,
  add column if not exists palavra_passe_alterada_em   timestamptz,
  add column if not exists credenciais_enviadas_em     timestamptz;

comment on column public.utilizadores_painel.deve_trocar_palavra_passe is
  'true enquanto a conta ainda usa a palavra-passe que o sistema gerou; obriga a trocar no primeiro acesso';
comment on column public.utilizadores_painel.credenciais_enviadas_em is
  'quando saiu o último email com uma palavra-passe nova para esta conta';

-- As contas que já existiam antes desta migração foram criadas com uma
-- palavra-passe escolhida pelo administrador, e não por geração automática.
-- Não faz sentido obrigá-las a trocar já: marcamos como trocada.
update public.utilizadores_painel
   set deve_trocar_palavra_passe = false,
       palavra_passe_alterada_em = coalesce(palavra_passe_alterada_em, criado_em)
 where palavra_passe_alterada_em is null
   and criado_em < now();

-- 2. REGISTO DOS EMAILS INTERNOS ---------------------------------------------
--    A tabela emails_enviados exige candidato_id, e estes emails são para a
--    equipa, não para candidatos. Ficam aqui, com o mesmo propósito: saber o
--    que saiu, para quem e se chegou.
create table if not exists public.emails_equipa (
  id            uuid primary key default gen_random_uuid(),
  criado_em     timestamptz not null default now(),

  destinatario  text not null,
  tipo          text not null check (tipo in ('conta_criada', 'palavra_passe_reposta', 'aviso')),
  assunto       text not null,
  estado        text not null default 'enviado' check (estado in ('enviado', 'erro')),
  erro          text,
  enviado_por   text
);

create index if not exists idx_emails_equipa_data on public.emails_equipa (criado_em desc);

comment on table public.emails_equipa is
  'Emails enviados a utilizadores do painel: criação de conta e reposição de palavra-passe. Nunca guarda a palavra-passe.';

alter table public.emails_equipa enable row level security;
-- Sem policies: só a service_role escreve e lê.

-- ============================================================================
-- FIM
-- ============================================================================
