-- ============================================================================
-- CONSULVOLT - PLATAFORMA DE RECRUTAMENTO MULTI-CONCURSO
-- Fase 3: Formulário por configuração (campos dinâmicos por concurso)
-- ----------------------------------------------------------------------------
-- IDEMPOTENTE: pode ser corrido mais de uma vez sem apagar nada e sem duplicar.
-- ============================================================================

-- 1. Coluna de dados flexíveis do formulário em candidatos
alter table public.candidatos
  add column if not exists dados_formulario jsonb default '{}'::jsonb;

comment on column public.candidatos.dados_formulario is
  'Respostas aos campos configuráveis do formulário do concurso, em formato JSON.';

-- 2. Tabela de configuração dos campos de formulário por concurso
create table if not exists public.formulario_campos (
  id           uuid primary key default gen_random_uuid(),
  concurso_id  uuid not null references public.concursos(id) on delete cascade,
  chave        text not null,
  rotulo       text not null,
  tipo         text not null check (tipo in ('texto','numero','seleccao','booleano','sim_nao')),
  obrigatorio  boolean not null default false,
  opcoes       jsonb, -- array de strings quando tipo = 'seleccao'
  ajuda        text,
  ordem        integer not null default 0,
  criado_em    timestamptz not null default now(),
  constraint formulario_campos_concurso_chave_unica unique (concurso_id, chave)
);

create index if not exists idx_formulario_campos_concurso
  on public.formulario_campos (concurso_id, ordem);

comment on table public.formulario_campos is
  'Campos específicos que o formulário de cada concurso apresenta ao candidato.';

-- 3. RLS
alter table public.formulario_campos enable row level security;

-- Público lê campos de concursos abertos/fechados
drop policy if exists "formulario_campos_leitura_publica" on public.formulario_campos;
create policy "formulario_campos_leitura_publica"
  on public.formulario_campos for select to anon, authenticated
  using (
    exists (
      select 1 from public.concursos c
       where c.id = concurso_id and c.estado in ('aberto', 'fechado')
    )
  );

-- Autenticados gerem campos do seu concurso
drop policy if exists "so_o_proprio_concurso_formulario_campos" on public.formulario_campos;
create policy "so_o_proprio_concurso_formulario_campos"
  on public.formulario_campos
  for all to authenticated
  using (concurso_id = public.concurso_actual())
  with check (concurso_id = public.concurso_actual());

-- 4. Semente inicial dos campos do concurso pioneiro (Bengo)
do $$
declare
  v_concurso_id uuid;
begin
  select id into v_concurso_id from public.concursos where slug = 'bengo' limit 1;

  if v_concurso_id is not null then
    -- 4.1 Conhecimento de MT/BT
    insert into public.formulario_campos (concurso_id, chave, rotulo, tipo, obrigatorio, ajuda, ordem)
    values (
      v_concurso_id,
      'conhece_mtbt',
      'Tens conhecimento de redes eléctricas de Média e Baixa Tensão (MT/BT)?',
      'sim_nao',
      true,
      'Postos de transformação, linhas aéreas ou subterrâneas e contadores.',
      1
    )
    on conflict (concurso_id, chave) do nothing;

    -- 4.2 Carta de condução
    insert into public.formulario_campos (concurso_id, chave, rotulo, tipo, obrigatorio, ajuda, ordem)
    values (
      v_concurso_id,
      'tem_carta',
      'Tens carta de condução válida?',
      'sim_nao',
      true,
      'Ligeiro, pesado ou motociclo.',
      2
    )
    on conflict (concurso_id, chave) do nothing;

    -- 4.3 Experiência similar
    insert into public.formulario_campos (concurso_id, chave, rotulo, tipo, obrigatorio, ajuda, ordem)
    values (
      v_concurso_id,
      'experiencia_similar',
      'Já trabalhaste em cadastro de activos, inquéritos de terreno ou leitura de contadores?',
      'sim_nao',
      true,
      'Trabalho de campo com recolha de dados por formulário ou aplicação.',
      3
    )
    on conflict (concurso_id, chave) do nothing;
  end if;
end $$;
