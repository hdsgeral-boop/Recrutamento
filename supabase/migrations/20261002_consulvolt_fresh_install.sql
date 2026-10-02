-- ============================================================================
-- CONSULVOLT - INSTALAÇÃO LIMPA DA PLATAFORMA MULTI-CONCURSO
-- ----------------------------------------------------------------------------
-- Esta migração inicializa o sistema com isolamento total de organizações
-- e concursos, sem qualquer dado prévio ou amarrações específicas a projectos
-- antigos. Todas as vagas, requisitos, etapas e campos são 100% configuráveis
-- pelo gestor através do painel de administração.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ORGANIZAÇÕES (Empresas ou Entidades Contratantes)
-- ----------------------------------------------------------------------------
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
  'Entidades que tutelam ou contratam os processos de recrutamento.';

-- ----------------------------------------------------------------------------
-- 2. UTILIZADORES DO PAINEL (Administradores, Gestores e Recrutadores)
-- ----------------------------------------------------------------------------
create table if not exists public.utilizadores_painel (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  nome           text not null,
  papel          text not null default 'gestor'
                   check (papel in ('admin', 'gestor', 'avaliador', 'leitor')),
  activo         boolean not null default true,
  criado_em      timestamptz not null default now()
);

comment on table public.utilizadores_painel is
  'Utilizadores autorizados a aceder ao painel administrativo.';

-- ----------------------------------------------------------------------------
-- 3. CONCURSOS / PROCESSOS SELECTIVOS
-- ----------------------------------------------------------------------------
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
  vagas_previstas        integer not null default 10,
  candidaturas_abertas   boolean not null default true,
  mensagem_encerrado     text,

  -- Versões de motor técnico e formulários
  rubrica_versao         text not null default 'padrao-v1',
  roteiro_id             text default 'padrao-e1',

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

  -- Armazenamento em nuvem
  pasta_drive_id         text,
  pasta_drive_nome       text default 'Recrutamento_Consulvolt',

  -- Configurações analíticas e visuais dinâmicas
  funil                  jsonb,
  estados                jsonb,
  graficos               jsonb,

  criado_em              timestamptz not null default now()
);

create index if not exists idx_concursos_slug on public.concursos (slug);
create index if not exists idx_concursos_dominio on public.concursos (dominio) where dominio is not null;
create index if not exists idx_concursos_org on public.concursos (organizacao_id);

-- ----------------------------------------------------------------------------
-- 4. MEMBROS / GESTORES POR CONCURSO (Isolamento Multi-Empresa)
-- ----------------------------------------------------------------------------
create table if not exists public.membros (
  id             uuid primary key default gen_random_uuid(),
  utilizador_id  uuid not null references public.utilizadores_painel(id) on delete cascade,
  concurso_id    uuid not null references public.concursos(id) on delete cascade,
  papel          text not null default 'gestor'
                   check (papel in ('admin','gestor','editor','visualizador')),
  e_recrutador   boolean not null default false,
  criado_em      timestamptz not null default now(),
  constraint membros_utilizador_concurso_unico unique (utilizador_id, concurso_id)
);

create index if not exists idx_membros_concurso on public.membros (concurso_id);
create index if not exists idx_membros_utilizador on public.membros (utilizador_id);

-- ----------------------------------------------------------------------------
-- 5. CAMPOS DINÂMICOS CONFIGURÁVEIS DO FORMULÁRIO POR CONCURSO
-- ----------------------------------------------------------------------------
create table if not exists public.formulario_campos (
  id            uuid primary key default gen_random_uuid(),
  concurso_id   uuid not null references public.concursos(id) on delete cascade,
  campo_chave   text not null,
  etiqueta      text not null,
  tipo          text not null default 'texto'
                  check (tipo in ('texto', 'textarea', 'numero', 'seleccao', 'ficheiro', 'booleano', 'data')),
  obrigatorio   boolean not null default false,
  ordem         integer not null default 0,
  opcoes        jsonb default '[]'::jsonb,
  descricao     text,
  placeholder   text,
  activo        boolean not null default true,
  criado_em     timestamptz not null default now(),
  constraint formulario_campos_chave_unica unique (concurso_id, campo_chave)
);

create index if not exists idx_formulario_campos_concurso on public.formulario_campos(concurso_id);

-- ----------------------------------------------------------------------------
-- 6. CANDIDATURAS
-- ----------------------------------------------------------------------------
create table if not exists public.candidatos (
  id                          uuid primary key default gen_random_uuid(),
  concurso_id                 uuid not null references public.concursos(id) on delete cascade,
  codigo_candidatura          text,
  nome_completo               text not null,
  bilhete_identidade          text not null,
  email                       text not null,
  telefone                    text not null,
  telefone_alternativo        text,
  genero                      text,
  data_nascimento             date,
  provincia                   text not null default 'Luanda',
  municipio                   text not null default 'Luanda',
  comuna                      text,
  bairro                      text,
  nivel_academico             text not null,
  curso                       text not null,
  experiencia_similar         boolean not null default false,
  tem_carta                   boolean not null default false,
  carta_conducao_ficheiro_url text,
  cv_url                      text,
  bi_url                      text,
  certificado_url             text,
  comprovativo_experiencia_url text,
  resumo_cv                   text,
  respostas_personalizadas    jsonb default '{}'::jsonb,
  estado                      text not null default 'Pendente',
  submetido_em                timestamptz not null default now(),
  constraint candidatos_bi_concurso_unico unique (concurso_id, bilhete_identidade)
);

create index if not exists idx_candidatos_concurso on public.candidatos (concurso_id);
create index if not exists idx_candidatos_estado on public.candidatos (concurso_id, estado);
create index if not exists idx_candidatos_submissao on public.candidatos (concurso_id, submetido_em desc);

-- ----------------------------------------------------------------------------
-- 7. ANÁLISES E CLASSIFICAÇÃO AUTOMÁTICA
-- ----------------------------------------------------------------------------
create table if not exists public.analises_candidato (
  id                   uuid primary key default gen_random_uuid(),
  candidato_id         uuid not null unique references public.candidatos(id) on delete cascade,
  pontuacao_total      numeric(5,2) not null default 0,
  pontuacao_experiencia numeric(5,2) not null default 0,
  pontuacao_formacao   numeric(5,2) not null default 0,
  pontuacao_residencia numeric(5,2) not null default 0,
  rubrica_versao       text not null default 'padrao-v1',
  detalhes             jsonb default '{}'::jsonb,
  alertas              jsonb default '[]'::jsonb,
  processado_em        timestamptz not null default now()
);

create index if not exists idx_analises_pontuacao on public.analises_candidato (pontuacao_total desc);

-- ----------------------------------------------------------------------------
-- 8. ENTREVISTAS E AVALIAÇÕES
-- ----------------------------------------------------------------------------
create table if not exists public.agendas_entrevista (
  id           uuid primary key default gen_random_uuid(),
  concurso_id  uuid not null references public.concursos(id) on delete cascade,
  data         date not null,
  hora_inicio  time not null,
  hora_fim     time not null,
  sala         integer not null default 1,
  bloqueado    boolean not null default false,
  criado_em    timestamptz not null default now(),
  constraint agenda_slot_unico unique (concurso_id, data, hora_inicio, sala)
);

create table if not exists public.entrevistas (
  id           uuid primary key default gen_random_uuid(),
  concurso_id  uuid not null references public.concursos(id) on delete cascade,
  candidato_id uuid not null unique references public.candidatos(id) on delete cascade,
  data         date not null,
  hora_inicio  time not null,
  hora_fim     time not null,
  sala         integer not null default 1,
  modalidade   text not null default 'videochamada'
                 check (modalidade in ('videochamada', 'chamada', 'presencial')),
  link_meet    text,
  estado       text not null default 'agendada'
                 check (estado in ('agendada', 'realizada', 'cancelada', 'falhou')),
  criado_em    timestamptz not null default now()
);

create index if not exists idx_entrevistas_concurso on public.entrevistas (concurso_id);
create index if not exists idx_entrevistas_data on public.entrevistas (concurso_id, data, hora_inicio);

create table if not exists public.avaliacoes_entrevista (
  id                    uuid primary key default gen_random_uuid(),
  entrevista_id         uuid not null references public.entrevistas(id) on delete cascade,
  avaliador_id          uuid references public.utilizadores_painel(id) on delete set null,
  roteiro_id            text not null default 'padrao-e1',
  pontuacao_final       numeric(5,2) not null default 0,
  respostas             jsonb default '{}'::jsonb,
  observacoes           text,
  hora_inicio_relogio   timestamptz,
  hora_fim_relogio      timestamptz,
  concluida             boolean not null default false,
  criado_em             timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. HISTÓRICO DE COMUNICAÇÕES (EMAILS)
-- ----------------------------------------------------------------------------
create table if not exists public.historico_emails (
  id           uuid primary key default gen_random_uuid(),
  concurso_id  uuid references public.concursos(id) on delete set null,
  candidato_id uuid references public.candidatos(id) on delete set null,
  destinatario text not null,
  assunto      text not null,
  corpo        text not null,
  tipo         text not null,
  estado       text not null default 'enviado',
  enviado_em   timestamptz not null default now()
);

create index if not exists idx_emails_concurso on public.historico_emails (concurso_id);

-- ----------------------------------------------------------------------------
-- 10. SEGURANÇA E POLÍTICAS DE RLS (Row Level Security)
-- ----------------------------------------------------------------------------
alter table public.organizacoes enable row level security;
alter table public.concursos enable row level security;
alter table public.membros enable row level security;
alter table public.formulario_campos enable row level security;
alter table public.candidatos enable row level security;
alter table public.analises_candidato enable row level security;
alter table public.agendas_entrevista enable row level security;
alter table public.entrevistas enable row level security;
alter table public.avaliacoes_entrevista enable row level security;
alter table public.historico_emails enable row level security;

-- Políticas universais de leitura pública para submissão de candidaturas
create policy "Concursos públicos visíveis" on public.concursos
  for select using (estado = 'aberto' or candidaturas_abertas = true);

create policy "Formulários públicos visíveis" on public.formulario_campos
  for select using (activo = true);

create policy "Submissão livre de candidaturas" on public.candidatos
  for insert with check (true);

-- Políticas com service_role (acesso total no servidor de aplicação / API)
create policy "Service role acesso total organizacoes" on public.organizacoes
  for all using (auth.role() = 'service_role');

create policy "Service role acesso total concursos" on public.concursos
  for all using (auth.role() = 'service_role');

create policy "Service role acesso total membros" on public.membros
  for all using (auth.role() = 'service_role');

create policy "Service role acesso total formulario_campos" on public.formulario_campos
  for all using (auth.role() = 'service_role');

create policy "Service role acesso total candidatos" on public.candidatos
  for all using (auth.role() = 'service_role');

create policy "Service role acesso total analises" on public.analises_candidato
  for all using (auth.role() = 'service_role');

create policy "Service role acesso total agendas" on public.agendas_entrevista
  for all using (auth.role() = 'service_role');

create policy "Service role acesso total entrevistas" on public.entrevistas
  for all using (auth.role() = 'service_role');

create policy "Service role acesso total avaliacoes" on public.avaliacoes_entrevista
  for all using (auth.role() = 'service_role');

create policy "Service role acesso total emails" on public.historico_emails
  for all using (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 11. SEMEADURA INICIAL LIMPA (Consulvolt - Sistema Pronto a Usar)
-- ----------------------------------------------------------------------------
do $$
declare
  v_org_id uuid;
  v_concurso_id uuid;
begin
  -- 1) Organização principal
  insert into public.organizacoes (nome, cor_principal, site)
  values ('Consulvolt Engenharia e Serviços', '#CE1B2E', 'https://consulvolt.ao')
  returning id into v_org_id;

  -- 2) Concurso geral inicial (100% configurável pelo gestor)
  insert into public.concursos (
    organizacao_id,
    slug,
    nome,
    vaga_titulo,
    vaga_descricao,
    estado,
    vagas_previstas,
    candidaturas_abertas,
    rubrica_versao,
    roteiro_id,
    pasta_drive_nome
  ) values (
    v_org_id,
    'geral',
    'Processo Selectivo Geral Consulvolt',
    'Oportunidade Profissional',
    'Processo selectivo aberto para profissionais qualificados. Candidate-se preenchendo o formulário abaixo.',
    'aberto',
    10,
    true,
    'padrao-v1',
    'padrao-e1',
    'Recrutamento_Consulvolt'
  ) returning id into v_concurso_id;

  -- 3) Campos dinâmicos iniciais configuráveis
  insert into public.formulario_campos (concurso_id, campo_chave, etiqueta, tipo, obrigatorio, ordem, descricao)
  values 
    (v_concurso_id, 'anos_experiencia', 'Anos de Experiência na Área', 'numero', false, 1, 'Total de anos de experiência de trabalho relevante.'),
    (v_concurso_id, 'disponibilidade_deslocacao', 'Disponibilidade para Deslocações', 'booleano', false, 2, 'Tem disponibilidade para viajar ou trabalhar fora da sua área de residência?');

end $$;
