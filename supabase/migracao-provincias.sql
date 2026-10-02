-- ============================================================================
-- MIGRAÇÃO - passar do schema inicial para o schema com províncias
--
-- Corre isto no SQL Editor do Supabase ANTES de o novo código entrar no ar.
-- Aplica estas mudanças:
--   + coluna `provincia` (Luanda / Bengo)
--   + municípios de Luanda passam a ser aceites
--   - colunas `tem_gps`, `disponivel_3m` e `data_inicio` são removidas
--
-- Seguro de correr mais que uma vez.
-- ============================================================================

-- 0. A vista antiga depende das colunas que vamos mexer: sai primeiro,
--    e volta a ser criada no fim já com a província.
drop view if exists public.vw_resumo_municipio;

-- 1. Tipo das províncias -------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'provincia_angola') then
    create type public.provincia_angola as enum ('Luanda', 'Bengo');
  end if;
end $$;

-- 2. Nova coluna --------------------------------------------------------------
alter table public.candidatos
  add column if not exists provincia public.provincia_angola;

-- As candidaturas que já existirem são todas do Bengo (era o único âmbito).
update public.candidatos set provincia = 'Bengo' where provincia is null;

alter table public.candidatos alter column provincia set not null;

-- 3. O município deixa de ser ENUM e passa a texto com CHECK -------------------
--    Assim a lista de municípios muda sem as dores de um ALTER TYPE.
alter table public.candidatos alter column municipio type text using municipio::text;

alter table public.candidatos drop constraint if exists candidatos_municipio_da_provincia;
alter table public.candidatos add constraint candidatos_municipio_da_provincia check (
  (provincia = 'Luanda' and municipio in (
    'Belas','Cacuaco','Cazenga','Icolo e Bengo','Kilamba Kiaxi',
    'Luanda','Quiçama','Talatona','Viana'
  ))
  or
  (provincia = 'Bengo' and municipio in (
    'Ambriz','Bula Atumba','Caxito','Dande','Dembos','Nambuangongo','Pango Aluquém'
  ))
);

-- 4. Campos que deixaram de ser pedidos ---------------------------------------
alter table public.candidatos drop column if exists tem_gps;
alter table public.candidatos drop column if exists disponivel_3m;
alter table public.candidatos drop column if exists data_inicio;

-- 5. Índices ------------------------------------------------------------------
drop index if exists public.idx_candidatos_disponivel;
create index if not exists idx_candidatos_provincia on public.candidatos (provincia);
create index if not exists idx_candidatos_mtbt      on public.candidatos (conhece_mtbt);

-- 6. Vista de resumo, agora com província --------------------------------------
create view public.vw_resumo_municipio as
select
  provincia,
  municipio,
  count(*)                                    as total,
  count(*) filter (where tem_carta)           as com_carta,
  count(*) filter (where conhece_mtbt)        as com_mtbt,
  count(*) filter (where status = 'Aprovado') as aprovados,
  count(*) filter (where status = 'Pendente') as pendentes
from public.candidatos
group by provincia, municipio
order by total desc;

-- 7. O ENUM antigo dos municípios já não é usado por ninguém -------------------
drop type if exists public.municipio_bengo;

-- ============================================================================
-- FIM
-- ============================================================================
