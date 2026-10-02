-- ============================================================================
-- MIGRAÇÃO - Ranking analítico de candidatos (bengo-v1)
--
-- ADITIVA: não altera nem apaga nada do que já existe. Só acrescenta uma
-- coluna à tabela candidatos e duas tabelas novas.
-- Seguro de correr mais que uma vez.
-- ============================================================================

-- 1. Guardar o ID da pasta do Drive -------------------------------------------
--    Com o âmbito drive.file a aplicação só vê o que criou, e procurar pastas
--    pelo nome é frágil quando dois candidatos se chamam parecido. Guardamos
--    o ID e deixamos de adivinhar.
alter table public.candidatos
  add column if not exists drive_folder_id text;

comment on column public.candidatos.drive_folder_id is
  'ID da pasta do candidato no Google Drive, para chegar aos ficheiros sem os procurar pelo nome';

-- 2. Texto extraído dos documentos, em cache por ficheiro ---------------------
--    Evita repetir o OCR de cada vez que a rubrica muda.
create table if not exists public.documentos_texto (
  id             uuid primary key default gen_random_uuid(),
  candidato_id   uuid not null references public.candidatos(id) on delete cascade,
  drive_file_id  text not null unique,
  tipo_documento text not null
    check (tipo_documento in ('cv','bi','certificado','experiencia','outro')),
  nome_ficheiro  text not null,
  mime_type      text,
  sha256         text,
  texto          text,
  metodo         text not null default 'drive_ocr',
  caracteres     int generated always as (coalesce(length(texto), 0)) stored,
  legivel        boolean generated always as (coalesce(length(texto), 0) >= 120) stored,
  erro           text,
  criado_em      timestamptz not null default now()
);

create index if not exists idx_documentos_texto_candidato
  on public.documentos_texto (candidato_id);

-- 3. Resultado da análise ------------------------------------------------------
--    Uma linha por par (candidato, versão da rubrica, estado dos ficheiros).
create table if not exists public.analises_candidato (
  id                 uuid primary key default gen_random_uuid(),
  candidato_id       uuid not null references public.candidatos(id) on delete cascade,
  versao_rubrica     text not null,
  pontuacao_total    numeric(5,2),
  pontuacao_detalhe  jsonb,
  extraccao          jsonb,
  alertas            jsonb not null default '[]'::jsonb,
  eliminado          boolean not null default false,
  motivo_eliminacao  text,
  hash_documentos    text not null,
  modelo             text,
  tokens_entrada     int,
  tokens_saida       int,
  estado             text not null default 'pendente'
    check (estado in ('pendente','a_processar','concluida','erro')),
  erro               text,
  tentativas         int not null default 0,
  criado_em          timestamptz not null default now(),
  actualizado_em     timestamptz not null default now(),
  unique (candidato_id, versao_rubrica, hash_documentos)
);

create index if not exists idx_analises_estado
  on public.analises_candidato (estado);
create index if not exists idx_analises_pontuacao
  on public.analises_candidato (pontuacao_total desc nulls last);
create index if not exists idx_analises_candidato
  on public.analises_candidato (candidato_id, criado_em desc);

-- 4. RLS: nada de público. Só a service_role, como no resto do painel ---------
alter table public.documentos_texto     enable row level security;
alter table public.analises_candidato   enable row level security;

drop policy if exists "autenticados_leem_documentos_texto" on public.documentos_texto;
create policy "autenticados_leem_documentos_texto"
  on public.documentos_texto for select to authenticated using (true);

drop policy if exists "autenticados_leem_analises" on public.analises_candidato;
create policy "autenticados_leem_analises"
  on public.analises_candidato for select to authenticated using (true);

-- 5. Vista de apoio: a análise mais recente de cada candidato -----------------
drop view if exists public.vw_ranking;
create view public.vw_ranking as
select distinct on (a.candidato_id)
  a.candidato_id,
  a.pontuacao_total,
  a.pontuacao_detalhe,
  a.alertas,
  a.eliminado,
  a.motivo_eliminacao,
  a.versao_rubrica,
  a.estado,
  a.criado_em as analisado_em
from public.analises_candidato a
order by a.candidato_id, a.criado_em desc;

-- ============================================================================
-- FIM
-- ============================================================================
