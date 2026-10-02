-- ============================================================================
-- CONSULVOLT - PLATAFORMA DE RECRUTAMENTO MULTI-CONCURSO
-- Fase 1: Tabelas estruturais, concurso_id, índices, RLS e migração do Bengo
-- ----------------------------------------------------------------------------
-- IDEMPOTENTE: pode ser corrido mais de uma vez sem apagar nada e sem duplicar.
-- Mantém a instalação actual intacta, promovendo-a a concurso pioneiro ("bengo").
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TABELAS NOVAS DE GOVERNAÇÃO
-- ----------------------------------------------------------------------------

-- Organização que contrata ou tutela o processo (ex.: Consulvolt, UGP, EPAL)
create table if not exists public.organizacoes (
  id             uuid primary key default gen_random_uuid(),
  criada_em      timestamptz not null default now(),
  nome           text not null,
  nif            text,
  logotipo_url   text,
  cor_principal  text not null default '#CE1B2E',
  site           text
);

comment on table public.organizacoes is
  'Entidades contratantes. Permite agrupar concursos sob a mesma marca institucional.';

-- Concursos: cada concurso é uma linha com a sua própria configuração
create table if not exists public.concursos (
  id                     uuid primary key default gen_random_uuid(),
  organizacao_id         uuid not null references public.organizacoes(id) on delete cascade,
  slug                   text not null unique,
  dominio                text unique,
  nome                   text not null,
  vaga_titulo            text not null,
  vaga_descricao         text,
  estado                 text not null default 'aberto'
                           check (estado in ('rascunho','aberto','fechado','arquivado')),

  -- Prazos e metas
  prazo_candidaturas     timestamptz,
  vagas_previstas        integer not null default 58,
  candidaturas_abertas   boolean not null default true,
  mensagem_encerrado     text,

  -- Versões de motor técnico
  rubrica_versao         text not null default 'bengo-v1',
  roteiro_id             text default 'bengo-e1',

  -- Janela e parâmetros operacionais de entrevista
  janela_abertura        text not null default '08:30',
  janela_fecho           text not null default '17:00',
  duracao_entrevista_min integer not null default 30
                           check (duracao_entrevista_min between 5 and 240),
  descanso_min           integer not null default 5
                           check (descanso_min between 0 and 60),
  modalidade_padrao      text not null default 'videochamada'
                           check (modalidade_padrao in ('videochamada','chamada','presencial')),

  -- Comunicações
  remetente_nome         text not null default 'CONSULVOLT - Recrutamento',
  remetente_email        text,
  endereco_resposta      text,

  -- Google Drive
  pasta_drive_id         text,
  pasta_drive_nome       text default 'Recrutamento_Bengo_2026',

  -- Configurações analíticas e visuais migradas de definicoes
  funil                  jsonb,
  estados                jsonb,
  graficos               jsonb,

  criado_em              timestamptz not null default now()
);

create index if not exists idx_concursos_slug on public.concursos (slug);
create index if not exists idx_concursos_dominio on public.concursos (dominio) where dominio is not null;
create index if not exists idx_concursos_org on public.concursos (organizacao_id);

comment on table public.concursos is
  'Cada concurso de recrutamento com as suas regras, prazos e parâmetros independentes.';

-- Membros: quem acede a que concurso e com que privilégios
create table if not exists public.membros (
  id             uuid primary key default gen_random_uuid(),
  utilizador_id  uuid not null references public.utilizadores_painel(id) on delete cascade,
  concurso_id    uuid not null references public.concursos(id) on delete cascade,
  papel          text not null default 'visualizador'
                   check (papel in ('admin','gestor','editor','visualizador')),
  e_recrutador   boolean not null default false,
  criado_em      timestamptz not null default now(),
  constraint membros_utilizador_concurso_unico unique (utilizador_id, concurso_id)
);

create index if not exists idx_membros_concurso on public.membros (concurso_id);
create index if not exists idx_membros_utilizador on public.membros (utilizador_id);

comment on table public.membros is
  'Associação de utilizadores a concursos com os respectivos papéis e funções.';

-- ----------------------------------------------------------------------------
-- 2. REGISTO DA ORGANIZAÇÃO E CONCURSO INICIAL (BENGO)
-- ----------------------------------------------------------------------------
do $$
declare
  v_org_id uuid;
  v_concurso_id uuid;
  v_prazo timestamptz;
  v_vagas int;
  v_abertas boolean;
  v_msg text;
  v_funil jsonb;
  v_estados jsonb;
  v_graficos jsonb;
begin
  -- 1) Organização Consulvolt
  select id into v_org_id from public.organizacoes where nome = 'CONSULVOLT' limit 1;
  if v_org_id is null then
    insert into public.organizacoes (nome, nif, cor_principal, site)
    values ('CONSULVOLT', '5000000000', '#CE1B2E', 'https://www.consulvolt.pt')
    returning id into v_org_id;
  end if;

  -- 2) Ler dados actuais de definicoes se existirem
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'definicoes') then
    select prazo_candidaturas, vagas_previstas, candidaturas_abertas, mensagem_encerrado, funil, estados, graficos
      into v_prazo, v_vagas, v_abertas, v_msg, v_funil, v_estados, v_graficos
      from public.definicoes
     where id = true
     limit 1;
  end if;

  -- 3) Criar o primeiro concurso: slug "bengo"
  select id into v_concurso_id from public.concursos where slug = 'bengo' limit 1;
  if v_concurso_id is null then
    insert into public.concursos (
      organizacao_id,
      slug,
      dominio,
      nome,
      vaga_titulo,
      vaga_descricao,
      estado,
      prazo_candidaturas,
      vagas_previstas,
      candidaturas_abertas,
      mensagem_encerrado,
      rubrica_versao,
      roteiro_id,
      pasta_drive_nome,
      funil,
      estados,
      graficos
    ) values (
      v_org_id,
      'bengo',
      'bengo.recrutar.co.ao',
      'Técnico de Cadastro - Bengo',
      'Técnico de Cadastro',
      'Recrutamento de Técnicos de Cadastro para trabalho de terreno no Projecto Bengo.',
      'aberto',
      coalesce(v_prazo, timestamptz '2026-09-12 00:00:00+01'),
      coalesce(v_vagas, 58),
      coalesce(v_abertas, true),
      v_msg,
      'bengo-v1',
      'bengo-e1',
      'Recrutamento_Bengo_2026',
      v_funil,
      v_estados,
      v_graficos
    )
    returning id into v_concurso_id;
  end if;

  -- 4) Associar utilizadores actuais ao concurso pioneiro
  insert into public.membros (utilizador_id, concurso_id, papel, e_recrutador)
  select u.id, v_concurso_id, u.papel, u.e_recrutador
    from public.utilizadores_painel u
   where not exists (
     select 1 from public.membros m
      where m.utilizador_id = u.id and m.concurso_id = v_concurso_id
   );
end $$;

-- ----------------------------------------------------------------------------
-- 3. ADICIONAR concurso_id EM TODAS AS TABELAS OPERACIONAIS
-- ----------------------------------------------------------------------------
do $$
declare
  v_concurso_id uuid;
begin
  select id into v_concurso_id from public.concursos where slug = 'bengo' limit 1;

  -- 3.1 candidatos
  if not exists (select 1 from information_schema.columns where table_name = 'candidatos' and column_name = 'concurso_id') then
    alter table public.candidatos add column concurso_id uuid references public.concursos(id) on delete cascade;
    update public.candidatos set concurso_id = v_concurso_id where concurso_id is null;
    alter table public.candidatos alter column concurso_id set not null;
    create index if not exists idx_candidatos_concurso_id on public.candidatos (concurso_id);
  end if;

  -- 3.2 atribuicoes_entrevista
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'atribuicoes_entrevista') then
    if not exists (select 1 from information_schema.columns where table_name = 'atribuicoes_entrevista' and column_name = 'concurso_id') then
      alter table public.atribuicoes_entrevista add column concurso_id uuid references public.concursos(id) on delete cascade;
      update public.atribuicoes_entrevista set concurso_id = v_concurso_id where concurso_id is null;
      alter table public.atribuicoes_entrevista alter column concurso_id set not null;
      create index if not exists idx_atribuicoes_concurso_id on public.atribuicoes_entrevista (concurso_id);
    end if;
  end if;

  -- 3.3 avaliacoes_entrevista
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'avaliacoes_entrevista') then
    if not exists (select 1 from information_schema.columns where table_name = 'avaliacoes_entrevista' and column_name = 'concurso_id') then
      alter table public.avaliacoes_entrevista add column concurso_id uuid references public.concursos(id) on delete cascade;
      update public.avaliacoes_entrevista set concurso_id = v_concurso_id where concurso_id is null;
      alter table public.avaliacoes_entrevista alter column concurso_id set not null;
      create index if not exists idx_avaliacoes_concurso_id on public.avaliacoes_entrevista (concurso_id);
    end if;
  end if;

  -- 3.4 agendas_entrevista
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'agendas_entrevista') then
    if not exists (select 1 from information_schema.columns where table_name = 'agendas_entrevista' and column_name = 'concurso_id') then
      alter table public.agendas_entrevista add column concurso_id uuid references public.concursos(id) on delete cascade;
      update public.agendas_entrevista set concurso_id = v_concurso_id where concurso_id is null;
      alter table public.agendas_entrevista alter column concurso_id set not null;
      create index if not exists idx_agendas_concurso_id on public.agendas_entrevista (concurso_id);
    end if;
  end if;

  -- 3.5 entrevistas
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entrevistas') then
    if not exists (select 1 from information_schema.columns where table_name = 'entrevistas' and column_name = 'concurso_id') then
      alter table public.entrevistas add column concurso_id uuid references public.concursos(id) on delete cascade;
      update public.entrevistas set concurso_id = v_concurso_id where concurso_id is null;
      alter table public.entrevistas alter column concurso_id set not null;
      create index if not exists idx_entrevistas_concurso_id on public.entrevistas (concurso_id);
    end if;
  end if;

  -- 3.6 analises_candidato
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'analises_candidato') then
    if not exists (select 1 from information_schema.columns where table_name = 'analises_candidato' and column_name = 'concurso_id') then
      alter table public.analises_candidato add column concurso_id uuid references public.concursos(id) on delete cascade;
      update public.analises_candidato set concurso_id = v_concurso_id where concurso_id is null;
      alter table public.analises_candidato alter column concurso_id set not null;
      create index if not exists idx_analises_concurso_id on public.analises_candidato (concurso_id);
    end if;
  end if;

  -- 3.7 emails_enviados
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'emails_enviados') then
    if not exists (select 1 from information_schema.columns where table_name = 'emails_enviados' and column_name = 'concurso_id') then
      alter table public.emails_enviados add column concurso_id uuid references public.concursos(id) on delete cascade;
      update public.emails_enviados set concurso_id = v_concurso_id where concurso_id is null;
      alter table public.emails_enviados alter column concurso_id set not null;
      create index if not exists idx_emails_concurso_id on public.emails_enviados (concurso_id);
    end if;
  end if;

  -- 3.8 eventos_candidato
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'eventos_candidato') then
    if not exists (select 1 from information_schema.columns where table_name = 'eventos_candidato' and column_name = 'concurso_id') then
      alter table public.eventos_candidato add column concurso_id uuid references public.concursos(id) on delete cascade;
      update public.eventos_candidato set concurso_id = v_concurso_id where concurso_id is null;
      alter table public.eventos_candidato alter column concurso_id set not null;
      create index if not exists idx_eventos_concurso_id on public.eventos_candidato (concurso_id);
    end if;
  end if;

  -- 3.9 historico_entrevista
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'historico_entrevista') then
    if not exists (select 1 from information_schema.columns where table_name = 'historico_entrevista' and column_name = 'concurso_id') then
      alter table public.historico_entrevista add column concurso_id uuid references public.concursos(id) on delete cascade;
      update public.historico_entrevista set concurso_id = v_concurso_id where concurso_id is null;
      alter table public.historico_entrevista alter column concurso_id set not null;
      create index if not exists idx_historico_concurso_id on public.historico_entrevista (concurso_id);
    end if;
  end if;

  -- 3.10 roteiros_entrevista
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'roteiros_entrevista') then
    if not exists (select 1 from information_schema.columns where table_name = 'roteiros_entrevista' and column_name = 'concurso_id') then
      alter table public.roteiros_entrevista add column concurso_id uuid references public.concursos(id) on delete cascade;
      update public.roteiros_entrevista set concurso_id = v_concurso_id where concurso_id is null;
      alter table public.roteiros_entrevista alter column concurso_id set not null;
      create index if not exists idx_roteiros_concurso_id on public.roteiros_entrevista (concurso_id);
    end if;
  end if;

  -- 3.11 documentos_texto
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'documentos_texto') then
    if not exists (select 1 from information_schema.columns where table_name = 'documentos_texto' and column_name = 'concurso_id') then
      alter table public.documentos_texto add column concurso_id uuid references public.concursos(id) on delete cascade;
      update public.documentos_texto set concurso_id = v_concurso_id where concurso_id is null;
      alter table public.documentos_texto alter column concurso_id set not null;
      create index if not exists idx_docs_concurso_id on public.documentos_texto (concurso_id);
    end if;
  end if;

  -- 3.12 tentativas_chamada
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tentativas_chamada') then
    if not exists (select 1 from information_schema.columns where table_name = 'tentativas_chamada' and column_name = 'concurso_id') then
      alter table public.tentativas_chamada add column concurso_id uuid references public.concursos(id) on delete cascade;
      update public.tentativas_chamada set concurso_id = v_concurso_id where concurso_id is null;
      alter table public.tentativas_chamada alter column concurso_id set not null;
      create index if not exists idx_tentativas_concurso_id on public.tentativas_chamada (concurso_id);
    end if;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. AJUSTE DE UNICIDADES GLOBAIS PARA ESCOPO POR CONCURSO
-- ----------------------------------------------------------------------------

-- Candidatos: um mesmo cidadão (mesmo BI ou email) pode concorrer a concursos distintos
alter table public.candidatos drop constraint if exists candidatos_bi_key;
alter table public.candidatos drop constraint if exists candidatos_email_key;
alter table public.candidatos drop constraint if exists candidatos_concurso_bi_unico;
alter table public.candidatos add constraint candidatos_concurso_bi_unico unique (concurso_id, bi);
alter table public.candidatos drop constraint if exists candidatos_concurso_email_unico;
alter table public.candidatos add constraint candidatos_concurso_email_unico unique (concurso_id, email);

-- Roteiro activo: um activo por concurso, não na base inteira
drop index if exists public.idx_roteiro_activo_unico;
create unique index if not exists idx_roteiro_activo_por_concurso
  on public.roteiros_entrevista (concurso_id, activo)
  where activo;

-- Entrevistas: sobreposição por sala/hora por concurso
drop index if exists public.idx_entrevistas_sala_hora;
create unique index if not exists idx_entrevistas_sala_hora
  on public.entrevistas (concurso_id, inicio, sala)
  where estado <> 'cancelada';

drop index if exists public.idx_entrevistas_candidato_hora;
create unique index if not exists idx_entrevistas_candidato_hora
  on public.entrevistas (concurso_id, candidato_id, inicio)
  where estado <> 'cancelada';

-- ----------------------------------------------------------------------------
-- 5. FUNÇÃO DE CONTEXTO E ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

-- Lê o concurso da transacção actual ou do JWT de forma segura
create or replace function public.concurso_actual() returns uuid
language sql stable
as $$
  select nullif(current_setting('app.current_concurso_id', true), '')::uuid;
$$;

comment on function public.concurso_actual() is
  'Devolve o concurso_id associado à sessão ou ao pedido corrente. Nunca vem de entrada livre do cliente.';

-- Habilitar RLS em tabelas centrais
alter table public.concursos enable row level security;
alter table public.membros enable row level security;
alter table public.candidatos enable row level security;

-- Política de leitura de concursos: público lê concursos abertos/fechados pelo subdomínio
drop policy if exists "concursos_leitura_publica" on public.concursos;
create policy "concursos_leitura_publica"
  on public.concursos for select to anon, authenticated
  using (estado in ('aberto', 'fechado'));

-- Política de candidatos: público insere no seu concurso_actual(), autenticados lêem e actualizam
drop policy if exists "so_o_proprio_concurso_candidatos" on public.candidatos;
create policy "so_o_proprio_concurso_candidatos"
  on public.candidatos
  for all to authenticated
  using (concurso_id = public.concurso_actual())
  with check (concurso_id = public.concurso_actual());

drop policy if exists "candidatos_insercao_publica" on public.candidatos;
create policy "candidatos_insercao_publica"
  on public.candidatos
  for insert to anon
  with check (
    concurso_id = public.concurso_actual()
    or (
      concurso_id is not null
      and exists (
        select 1 from public.concursos c
         where c.id = concurso_id and c.estado = 'aberto' and c.candidaturas_abertas = true
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 6. CONFERÊNCIA AUTOMÁTICA DA MIGRAÇÃO
-- ----------------------------------------------------------------------------
do $$
declare
  v_total_concursos int;
  v_total_candidatos int;
  v_sem_concurso int;
begin
  select count(*) into v_total_concursos from public.concursos;
  select count(*) into v_total_candidatos from public.candidatos;
  select count(*) into v_sem_concurso from public.candidatos where concurso_id is null;

  if v_total_concursos < 1 then
    raise exception 'Falha na migração: concurso inicial não foi criado.';
  end if;

  if v_sem_concurso > 0 then
    raise exception 'Falha na migração: existem % candidatos sem concurso_id.', v_sem_concurso;
  end if;

  raise notice 'Migração Fase 1 concluída com sucesso: % concursos, % candidatos auditados.',
    v_total_concursos, v_total_candidatos;
end $$;
