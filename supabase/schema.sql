-- ============================================================================
-- CONSULVOLT - Recrutamento "TÉCNICO DE CADASTRO / PROJETO BENGO"
-- Schema Supabase (PostgreSQL)
-- Correr TUDO de uma vez no SQL Editor do Supabase.
-- Idempotente: pode ser corrido mais que uma vez sem partir nada.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- ----------------------------------------------------------------------------

-- Estado da candidatura no funil de recrutamento
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_candidatura') then
    create type public.status_candidatura as enum (
      'Pendente', 'Aprovado', 'Reprovado', 'Contactado'
    );
  end if;
end $$;

-- Províncias onde aceitamos candidaturas
do $$
begin
  if not exists (select 1 from pg_type where typname = 'provincia_angola') then
    create type public.provincia_angola as enum ('Luanda', 'Bengo');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. TABELA PRINCIPAL: candidatos
--    O município é texto simples com CHECK: a lista muda com a divisão
--    administrativa, e um CHECK altera-se sem as dores de um ALTER TYPE.
-- ----------------------------------------------------------------------------

create table if not exists public.candidatos (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Identificação do candidato
  nome                text not null,
  bi                  text not null unique,          -- Nº do Bilhete de Identidade
  provincia           public.provincia_angola not null,
  municipio           text not null,
  telefone            text not null,                 -- WhatsApp, formato 2449XXXXXXXX
  email               text not null unique,

  -- Perfil académico / técnico
  nivel_academico     text not null,
  curso               text,
  conhece_mtbt        boolean not null default false, -- Conhecimento de Média/Baixa Tensão
  tem_carta           boolean not null default false, -- Carta de condução
  experiencia_similar boolean not null default false, -- Já fez trabalho equivalente
  condicoes_aceites   boolean not null default false, -- Confirmou as condições de trabalho

  -- Gestão do processo
  status              public.status_candidatura not null default 'Pendente',
  observacoes         text,                          -- Notas internas do RH

  -- Arquivo documental
  drive_folder_url    text,
  cv_url              text,
  bi_url              text,
  certificado_url     text,
  experiencia_url     text,                          -- Comprovativo da experiência

  -- Estado do arquivamento em background (Drive + email)
  arquivamento_estado text not null default 'pendente'
    check (arquivamento_estado in ('pendente','concluido','erro')),
  arquivamento_erro   text,

  -- Validações ao nível da base de dados (defesa em profundidade)
  constraint candidatos_email_valido check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint candidatos_bi_valido    check (char_length(btrim(bi)) between 5 and 30),
  constraint candidatos_tel_valido   check (char_length(regexp_replace(telefone, '\D', '', 'g')) between 9 and 15)
);

-- O município tem de existir e pertencer mesmo à província indicada.
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

-- Normalização: BI sempre em maiúsculas, email sempre em minúsculas.
create or replace function public.normalizar_candidato()
returns trigger
language plpgsql
as $$
begin
  new.bi    := upper(btrim(new.bi));
  new.email := lower(btrim(new.email));
  new.nome  := btrim(new.nome);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_normalizar_candidato on public.candidatos;
create trigger trg_normalizar_candidato
  before insert or update on public.candidatos
  for each row execute function public.normalizar_candidato();

-- ----------------------------------------------------------------------------
-- 3. ÍNDICES (o painel filtra muito por estes campos)
-- ----------------------------------------------------------------------------

create index if not exists idx_candidatos_created_at   on public.candidatos (created_at desc);
create index if not exists idx_candidatos_provincia    on public.candidatos (provincia);
create index if not exists idx_candidatos_municipio    on public.candidatos (municipio);
create index if not exists idx_candidatos_status       on public.candidatos (status);
create index if not exists idx_candidatos_carta        on public.candidatos (tem_carta);
create index if not exists idx_candidatos_mtbt         on public.candidatos (conhece_mtbt);
create index if not exists idx_candidatos_experiencia  on public.candidatos (experiencia_similar);
create index if not exists idx_candidatos_arquivamento on public.candidatos (arquivamento_estado)
  where arquivamento_estado <> 'concluido';

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
--    Público (chave anon) => só pode INSERIR candidaturas.
--    Autenticados          => podem LER.
--    O painel admin usa a service_role no servidor, que ignora o RLS.
-- ----------------------------------------------------------------------------

alter table public.candidatos enable row level security;

drop policy if exists "publico_pode_inserir_candidatura" on public.candidatos;
create policy "publico_pode_inserir_candidatura"
  on public.candidatos for insert to anon, authenticated with check (true);

drop policy if exists "autenticados_podem_ler" on public.candidatos;
create policy "autenticados_podem_ler"
  on public.candidatos for select to authenticated using (true);

drop policy if exists "autenticados_podem_actualizar" on public.candidatos;
create policy "autenticados_podem_actualizar"
  on public.candidatos for update to authenticated using (true) with check (true);

-- ----------------------------------------------------------------------------
-- 5. STORAGE - bucket privado para os documentos (700 KB por ficheiro)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-candidatos', 'documentos-candidatos', false,
  716800, array['application/pdf','image/jpeg','image/png']  -- 700 KB por ficheiro
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

drop policy if exists "publico_pode_enviar_documentos" on storage.objects;
create policy "publico_pode_enviar_documentos"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'documentos-candidatos');

drop policy if exists "autenticados_podem_ler_documentos" on storage.objects;
create policy "autenticados_podem_ler_documentos"
  on storage.objects for select to authenticated
  using (bucket_id = 'documentos-candidatos');

-- ----------------------------------------------------------------------------
-- 6. VISTA DE APOIO - resumo para o painel / relatórios rápidos
-- ----------------------------------------------------------------------------

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
