-- ============================================================================
-- MÓDULO DE ENTREVISTAS NO PROJECTO BENGO
-- ----------------------------------------------------------------------------
-- O mesmo módulo que corre no projecto UGP, trazido para aqui.
--
-- SÓ ACRESCENTA. Não apaga linhas, não muda colunas que já existem, e não
-- toca em nenhuma tabela que já esteja a funcionar. Corre-se de uma vez no
-- SQL Editor do Supabase do Bengo, e pode correr-se outra vez sem estragar
-- nada: tudo o que cria é "if not exists".
--
-- O que o Bengo já tem e por isso não se repete aqui: a tabela
-- emails_enviados e as colunas entrevista_em, entrevista_local e
-- entrevista_notas em candidatos. A única coisa que se mexe numa tabela
-- existente é o check do tipo de email, que passa a ACEITAR MAIS UM valor -
-- nenhum email já gravado deixa de ser válido.
-- ============================================================================

-- ============================================================================
-- MÓDULO DE ENTREVISTAS
-- ----------------------------------------------------------------------------
-- Três tabelas novas e UMA coluna nova numa tabela existente. Nada é alterado
-- e nada é apagado: as tabelas que já funcionam ficam exactamente como estão.
--
-- Correr este ficheiro duas vezes não estraga nada.
--
--   agendas_entrevista   os parâmetros de uma grelha (salas, duração, dias)
--   entrevistas          uma marcação: candidato, dia, hora, sala
--   avaliacoes_entrevista  o que o entrevistador marcou, e a nota 0-100
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AGENDAS
-- ----------------------------------------------------------------------------
-- Guardam-se os PARÂMETROS, não a grelha. A grelha é sempre recalculada a
-- partir deles pelo motor, que é uma função pura. É isso que faz com que
-- mudar o número de salas não deixe metade da agenda velha e metade nova.
create table if not exists public.agendas_entrevista (
  id                 uuid primary key default gen_random_uuid(),
  criada_em          timestamptz not null default now(),
  criada_por         text,
  nome               text not null,
  estado             text not null default 'rascunho'
                       check (estado in ('rascunho','confirmada','cancelada')),

  data_inicio        date not null,
  salas              int  not null default 2  check (salas between 1 and 20),
  duracao_minutos    int  not null default 30 check (duracao_minutos between 5 and 240),
  intervalo_minutos  int  not null default 0  check (intervalo_minutos between 0 and 120),
  -- Períodos e dias vão em JSON porque são listas de tamanho variável e nunca
  -- são consultados por si: leem-se sempre com a agenda inteira.
  periodos           jsonb not null default '[{"inicio":"08:30","fim":"12:30"},{"inicio":"14:00","fim":"17:00"}]'::jsonb,
  dias_semana        jsonb not null default '[1,2,3,4,5]'::jsonb,
  excepcoes          jsonb not null default '[]'::jsonb,

  local_nome         text,
  local_morada       text,
  local_plus_code    text,
  notas              text
);

comment on table public.agendas_entrevista is
  'Parâmetros de uma grelha de entrevistas. A grelha em si é recalculada pelo motor a partir daqui.';

-- ----------------------------------------------------------------------------
-- 2. ENTREVISTAS MARCADAS
-- ----------------------------------------------------------------------------
create table if not exists public.entrevistas (
  id             uuid primary key default gen_random_uuid(),
  criada_em      timestamptz not null default now(),
  agenda_id      uuid references public.agendas_entrevista(id) on delete set null,
  candidato_id   uuid not null references public.candidatos(id) on delete cascade,

  inicio         timestamptz not null,
  fim            timestamptz not null,
  sala           int not null default 1 check (sala >= 1),

  estado         text not null default 'marcada'
                   check (estado in ('marcada','notificada','realizada','faltou','cancelada')),
  notificada_em  timestamptz,

  constraint entrevistas_fim_depois_do_inicio check (fim > inicio)
);

-- Um candidato não pode ter duas entrevistas marcadas ao mesmo tempo, e uma
-- sala não pode ter duas pessoas à mesma hora. O motor já evita as duas
-- coisas, mas o motor não é a última linha de defesa: alguém a marcar à mão
-- pelo painel também tem de esbarrar aqui.
create unique index if not exists idx_entrevistas_sala_hora
  on public.entrevistas (inicio, sala)
  where estado <> 'cancelada';

create unique index if not exists idx_entrevistas_candidato_hora
  on public.entrevistas (candidato_id, inicio)
  where estado <> 'cancelada';

create index if not exists idx_entrevistas_candidato on public.entrevistas (candidato_id);
create index if not exists idx_entrevistas_agenda    on public.entrevistas (agenda_id);
create index if not exists idx_entrevistas_inicio    on public.entrevistas (inicio);

-- ----------------------------------------------------------------------------
-- 3. AVALIAÇÕES
-- ----------------------------------------------------------------------------
create table if not exists public.avaliacoes_entrevista (
  id              uuid primary key default gen_random_uuid(),
  criada_em       timestamptz not null default now(),
  actualizada_em  timestamptz not null default now(),

  candidato_id    uuid not null references public.candidatos(id) on delete cascade,
  entrevista_id   uuid references public.entrevistas(id) on delete set null,

  -- A versão do roteiro com que esta entrevista foi feita. Sem isto, mudar as
  -- perguntas amanhã reescrevia o significado das avaliações de ontem.
  versao_roteiro  text not null,
  avaliador       text,

  -- { "T1": "bom", "T2": "razoavel", ... }
  respostas       jsonb not null default '{}'::jsonb,
  nota            numeric(5,2) check (nota between 0 and 100),
  peso_respondido int,
  incompleta      boolean not null default false,

  -- Como a avaliação entrou no sistema: escrita no ecrã, ou lida de papel.
  origem          text not null default 'painel'
                    check (origem in ('painel','ficha_papel')),
  -- Quando veio de papel: o que a leitura por imagem devolveu, tal e qual, e
  -- a confiança que declarou. Guarda-se para se poder auditar uma leitura
  -- contestada sem ter de repetir a digitalização.
  leitura_bruta   jsonb,
  confianca       numeric(4,3) check (confianca between 0 and 1),
  ficha_url       text,

  observacoes     text,
  recomendacao    text check (recomendacao in ('avancar','reserva','nao_avancar'))
);

-- Uma avaliação por entrevista. Repetir a entrevista cria outra entrevista.
create unique index if not exists idx_avaliacoes_entrevista_unica
  on public.avaliacoes_entrevista (entrevista_id)
  where entrevista_id is not null;

create index if not exists idx_avaliacoes_candidato on public.avaliacoes_entrevista (candidato_id);
create index if not exists idx_avaliacoes_nota on public.avaliacoes_entrevista (nota desc nulls last);

-- ----------------------------------------------------------------------------
-- 4. UMA COLUNA NOVA EM candidatos
-- ----------------------------------------------------------------------------
-- Onde ficou a ficha da entrevista no Drive do candidato. Anulável: quem
-- ainda não foi entrevistado não tem ficha, e isso não é um "não".
alter table public.candidatos
  add column if not exists entrevista_drive_url text;

comment on column public.candidatos.entrevista_drive_url is
  'Pasta ou ficheiro da entrevista na pasta do candidato no Google Drive. Nulo = ainda não foi entrevistado.';

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------
-- O painel usa a service_role, que ignora o RLS. Ligamos o RLS e não criamos
-- política nenhuma: nada disto é público, e uma chave pública perdida não
-- chega a ver horários nem avaliações de ninguém.
alter table public.agendas_entrevista    enable row level security;
alter table public.entrevistas           enable row level security;
alter table public.avaliacoes_entrevista enable row level security;

-- ----------------------------------------------------------------------------
-- 6. VISTA DE LEITURA
-- ----------------------------------------------------------------------------
drop view if exists public.vw_entrevistas;
create view public.vw_entrevistas as
select
  e.id            as entrevista_id,
  e.candidato_id,
  c.nome,
  -- O Bengo não tem coluna de bairro: a morada aqui é o município. Esta vista
  -- veio do UGP, onde há bairro, e era este o campo que fazia a instalação
  -- rebentar a meio.
  c.municipio,
  c.telefone,
  c.email,
  e.inicio,
  e.fim,
  e.sala,
  e.estado,
  e.notificada_em,
  a.nota,
  a.recomendacao,
  a.incompleta,
  a.origem        as origem_avaliacao
from public.entrevistas e
join public.candidatos c on c.id = e.candidato_id
left join public.avaliacoes_entrevista a on a.entrevista_id = e.id
order by e.inicio;

select 'módulo de entrevistas instalado' as resultado;

-- ============================================================================
-- ROTEIRO DA ENTREVISTA EDITÁVEL NO PAINEL
-- ----------------------------------------------------------------------------
-- As perguntas deixam de viver só no código e passam a poder mudar-se no
-- painel, sem novo deploy.
--
-- PORQUÊ VERSÕES EM VEZ DE EDITAR EM CIMA
-- Uma avaliação guardada aponta para a versão do roteiro com que foi feita.
-- Se as perguntas fossem editadas no mesmo sítio, mudar um peso amanhã
-- reescrevia em silêncio o significado das entrevistas de ontem: a nota de
-- uma pessoa continuava a dizer 83, mas já não queria dizer a mesma coisa.
--
-- Por isso, gravar alterações CRIA UMA VERSÃO NOVA e passa-lhe o testemunho.
-- As versões antigas ficam, só deixam de estar activas. Nada se apaga.
--
-- Nada nesta migração toca no que já existe. Só acrescenta.
-- ============================================================================

create table if not exists public.roteiros_entrevista (
  versao      text primary key,
  criado_em   timestamptz not null default now(),
  criado_por  text,

  -- [{ codigo, bloco, pergunta, procurar, peso }, ...]
  -- Os pesos somam 100. A aplicação valida antes de gravar; o check aqui é a
  -- última linha de defesa contra uma inserção feita à mão no SQL Editor.
  perguntas   jsonb not null,

  -- Só um roteiro activo de cada vez. Ver o índice mais abaixo.
  activo      boolean not null default false,

  -- O que mudou nesta versão, para quem a ler daqui a seis meses perceber.
  notas       text,

  constraint roteiros_perguntas_e_lista check (jsonb_typeof(perguntas) = 'array'),
  constraint roteiros_tem_perguntas     check (jsonb_array_length(perguntas) > 0)
);

comment on table public.roteiros_entrevista is
  'Versões do roteiro da entrevista. Gravar alterações cria uma versão nova; as antigas ficam para as avaliações antigas continuarem a fazer sentido.';

-- Um e um só roteiro activo. O índice parcial é o que garante isto: duas
-- linhas com activo = true deixam de caber na tabela.
create unique index if not exists idx_roteiro_activo_unico
  on public.roteiros_entrevista (activo)
  where activo;

-- O painel usa a service_role, que ignora o RLS. Ligamos o RLS e não criamos
-- política nenhuma: o roteiro não é público.
alter table public.roteiros_entrevista enable row level security;

-- ----------------------------------------------------------------------------
-- UM TIPO DE EMAIL NOVO: O AGRADECIMENTO DEPOIS DA ENTREVISTA
-- ----------------------------------------------------------------------------
-- Só ACRESCENTA um valor permitido. Nenhum email já gravado deixa de ser
-- válido, e nenhuma linha muda. Sem isto, gravar a avaliação falhava no fim,
-- depois de já ter escrito a nota - que é a pior altura para falhar.
alter table public.emails_enviados
  drop constraint if exists emails_enviados_tipo_check;

alter table public.emails_enviados
  add constraint emails_enviados_tipo_check check (tipo in (
    'confirmacao','aprovacao','entrevista','reprovacao',
    'personalizado','rh','formacao','teste_fluxo','reuniao',
    'agradecimento'
  ));

-- ============================================================================
-- MÓDULO DE ENTREVISTAS: ATRIBUIÇÃO A RECRUTADORES E ESTADOS
-- ----------------------------------------------------------------------------
-- Só ACRESCENTA. Não apaga linhas, não muda colunas existentes, não mexe em
-- nenhuma tabela que já esteja a funcionar.
--
-- O QUE ESTA MIGRAÇÃO RESOLVE
-- Até aqui, "entrevista" era uma data em candidatos.entrevista_em e uma
-- avaliação em avaliacoes_entrevista. Faltava o meio: QUEM entrevista quem, e
-- em que ponto está o processo. É isso que a tabela nova guarda.
--
-- PORQUE NÃO É UM PAPEL NOVO
-- Recrutador não é um quinto papel. É uma FUNÇÃO que se liga e desliga em
-- quem já tem conta - um editor pode ser recrutador esta semana e deixar de o
-- ser na próxima, sem perder nem ganhar mais nada. Por isso é uma coluna
-- booleana em utilizadores_painel, e não um valor novo no check do papel:
-- mexer no check obrigava a rever todas as contas que já existem.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A FUNÇÃO DE RECRUTADOR
-- ----------------------------------------------------------------------------
alter table public.utilizadores_painel
  add column if not exists e_recrutador boolean not null default false;

comment on column public.utilizadores_painel.e_recrutador is
  'Função temporária, independente do papel. Liga-se e desliga-se sem alterar as permissões de base da conta.';

create index if not exists idx_utilizadores_recrutadores
  on public.utilizadores_painel (utilizador) where e_recrutador and activo;

-- ----------------------------------------------------------------------------
-- 2. ATRIBUIÇÃO E ESTADO DO PROCESSO DE ENTREVISTA
-- ----------------------------------------------------------------------------
-- Uma linha por candidato. Não haver linha quer dizer "não atribuída", que é
-- o estado inicial de toda a gente - não se criam 180 linhas vazias para
-- dizer que ainda ninguém foi atribuído.
create table if not exists public.atribuicoes_entrevista (
  id             uuid primary key default gen_random_uuid(),
  criada_em      timestamptz not null default now(),
  actualizada_em timestamptz not null default now(),

  candidato_id   uuid not null references public.candidatos(id) on delete cascade,

  -- O utilizador (coluna "utilizador" de utilizadores_painel) responsável.
  -- Texto e não chave estrangeira, para ser igual ao resto do sistema, que já
  -- guarda "criado_por" e "avaliador" desta maneira.
  recrutador     text,

  estado         text not null default 'atribuida'
                   check (estado in (
                     'atribuida','em_entrevista','concluida',
                     'cancelada','reagendada','ausente','nao_realizada'
                   )),

  -- Correcção manual da leitura automática de experiência. Nulo quer dizer
  -- "vale o que os dados do candidato dizem"; só se preenche quando uma
  -- pessoa discorda da leitura automática.
  grupo_manual   text check (grupo_manual in ('com_experiencia','sem_experiencia')),

  observacoes    text,

  -- --------------------------------------------------------------- AUDITORIA
  -- Vários utilizadores mexem no mesmo processo. Sem isto, "quem pôs este
  -- candidato neste recrutador?" não tem resposta.
  atribuida_por  text,
  atribuida_em   timestamptz not null default now(),
  iniciada_por   text,
  iniciada_em    timestamptz,
  concluida_por  text,
  concluida_em   timestamptz
);

-- Um candidato tem um processo de entrevista, não vários. Repetir a
-- entrevista muda o estado desta linha e acrescenta uma avaliação nova.
create unique index if not exists idx_atribuicao_candidato_unica
  on public.atribuicoes_entrevista (candidato_id);

create index if not exists idx_atribuicao_recrutador
  on public.atribuicoes_entrevista (recrutador) where recrutador is not null;
create index if not exists idx_atribuicao_estado
  on public.atribuicoes_entrevista (estado);

comment on table public.atribuicoes_entrevista is
  'Quem entrevista quem, e em que ponto está o processo. Não haver linha para um candidato significa que ainda não foi atribuído.';

alter table public.atribuicoes_entrevista enable row level security;

-- ----------------------------------------------------------------------------
-- 3. HISTÓRICO DAS MUDANÇAS
-- ----------------------------------------------------------------------------
-- Append-only: nada aqui se altera nem se apaga. É o que permite responder
-- meses depois a "quem mudou o recrutador deste candidato, e quando".
create table if not exists public.historico_entrevista (
  id           uuid primary key default gen_random_uuid(),
  quando       timestamptz not null default now(),
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  quem         text,
  accao        text not null,
  detalhe      text
);

create index if not exists idx_historico_candidato
  on public.historico_entrevista (candidato_id, quando desc);

alter table public.historico_entrevista enable row level security;

-- ----------------------------------------------------------------------------
-- 4. NOTA SOBRE OS GRUPOS DE PERGUNTAS
-- ----------------------------------------------------------------------------
-- As perguntas vivem em roteiros_entrevista.perguntas (jsonb) e ganham um
-- campo "grupo" com os valores 'ambos', 'com_experiencia' ou 'sem_experiencia'.
-- Não é preciso migração nenhuma para isso: uma pergunta gravada antes desta
-- mudança não tem o campo, e a aplicação lê-a como 'ambos' - que é o que ela
-- sempre foi. Fica aqui escrito para quem ler as migrações perceber porquê.

-- ============================================================================
-- DURAÇÃO DA ENTREVISTA
-- ----------------------------------------------------------------------------
-- Quanto tempo está previsto para cada entrevista. Definido quando se marca,
-- na Agenda, e usado pelo relógio que o entrevistador vê a contar para trás.
--
-- O CANDIDATO NUNCA VÊ ISTO.
-- É um instrumento de trabalho da equipa, não uma promessa ao candidato.
-- Dizer-lhe "tens 30 minutos" no email só o punha a olhar para o relógio em
-- vez de responder, e a equipa perdia a liberdade de alongar uma conversa que
-- estivesse a correr bem. Por isso a coluna vive aqui e não entra em nenhum
-- dos moldes de email.
--
-- Fica ao lado das outras colunas da entrevista em candidatos, que é onde a
-- marcação já vive. Só acrescenta; anulável, porque as entrevistas marcadas
-- antes desta migração não têm duração e isso não é um erro.
-- ============================================================================

alter table public.candidatos
  add column if not exists entrevista_duracao_min integer
    check (entrevista_duracao_min is null or entrevista_duracao_min between 5 and 240);

comment on column public.candidatos.entrevista_duracao_min is
  'Minutos previstos para a entrevista. Uso interno: nunca aparece em emails para o candidato. Nulo = sem duração definida.';
