-- ============================================================================
-- MIGRAÇÃO - experiência em trabalhos similares, condições de trabalho
--            e limite de 700 KB por ficheiro
--
-- Corre isto no SQL Editor do Supabase ANTES de o novo código entrar no ar.
-- Seguro de correr mais que uma vez.
-- ============================================================================

-- 1. Novas colunas -------------------------------------------------------------
alter table public.candidatos
  add column if not exists experiencia_similar boolean not null default false,
  add column if not exists experiencia_url     text,
  add column if not exists condicoes_aceites   boolean not null default false;

comment on column public.candidatos.experiencia_similar is
  'O candidato declarou ter experiência em trabalhos similares';
comment on column public.candidatos.experiencia_url is
  'Caminho no Storage do documento que comprova a experiência';
comment on column public.candidatos.condicoes_aceites is
  'O candidato confirmou ter tomado conhecimento das condições de trabalho';

-- 2. Índice para o painel filtrar por experiência ------------------------------
create index if not exists idx_candidatos_experiencia
  on public.candidatos (experiencia_similar);

-- 3. Limite do bucket passa a 700 KB --------------------------------
update storage.buckets
   set file_size_limit = 716800
 where id = 'documentos-candidatos';

-- 4. Vista de resumo, agora também com a experiência ---------------------------
drop view if exists public.vw_resumo_municipio;

create view public.vw_resumo_municipio as
select
  provincia,
  municipio,
  count(*)                                    as total,
  count(*) filter (where tem_carta)           as com_carta,
  count(*) filter (where conhece_mtbt)        as com_mtbt,
  count(*) filter (where experiencia_similar) as com_experiencia,
  count(*) filter (where status = 'Aprovado') as aprovados,
  count(*) filter (where status = 'Pendente') as pendentes
from public.candidatos
group by provincia, municipio
order by total desc;

-- ============================================================================
-- FIM
-- ============================================================================
