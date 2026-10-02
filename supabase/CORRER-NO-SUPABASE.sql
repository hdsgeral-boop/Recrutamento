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


---------------------------------------------------------------------------
-- 20260922c_dashboard_e_funil.sql
---------------------------------------------------------------------------

-- ===========================================================================
-- DASHBOARD, FUNIL CONFIGURÁVEL E DEMOGRAFIA LIDA DO BI  (PROJECTO BENGO)
-- ---------------------------------------------------------------------------
-- Tudo aqui é ACRESCENTAR. Não se apaga coluna nenhuma, não se muda tipo
-- nenhum, não se toca em dados existentes. Correr duas vezes é seguro.
--
-- Porque é que a configuração vai para colunas JSON de `definicoes` e não
-- para tabelas novas: é uma linha só, lê-se inteira de uma vez, e poupa três
-- idas à base de dados em cada abertura do painel. Num plano Free isso é a
-- diferença entre uma página que abre e uma que se arrasta.
-- ===========================================================================

-- --------------------------------------------------------------- DEFINIÇÕES
-- funil    : os degraus, com a taxa de passagem esperada de cada um
-- estados  : os estados do candidato, com as cores e os nomes antigos
-- graficos : os gráficos que o Dashboard mostra, na ordem escolhida
-- O alvo do funil. O Bengo ainda não tinha esta coluna; o UGP já a tem, e é
-- dela que sai o "quantos são precisos" de cada degrau da pirâmide.
alter table public.definicoes add column if not exists vagas_previstas integer default 58;

comment on column public.definicoes.vagas_previstas is
  'Quantas pessoas se pretende contratar. É o alvo do funil. NUNCA aparece no formulário público.';

alter table public.definicoes add column if not exists funil     jsonb;
alter table public.definicoes add column if not exists estados   jsonb;
alter table public.definicoes add column if not exists graficos  jsonb;

comment on column public.definicoes.funil is
  'Degraus do funil de recrutamento, editáveis no painel. NULL usa os valores de omissão do código.';
comment on column public.definicoes.estados is
  'Estados do candidato. Cada um traz os "aliases": nomes antigos que continuam gravados em candidatos.status.';
comment on column public.definicoes.graficos is
  'Gráficos do Dashboard, escolhidos pelo utilizador. Lista vazia é uma escolha válida.';

-- --------------------------------------------------------------- CANDIDATOS
-- Sexo e data de nascimento, lidos do BI que o candidato já carregou.
--
-- REGRA QUE O CÓDIGO GARANTE E QUE FICA AQUI ESCRITA PARA QUEM LER A BASE:
-- estas duas colunas servem para CONTAR no Dashboard, nunca para PONTUAR.
-- Não entram na rubrica, não entram no ranking e não entram no prompt do
-- modelo de linguagem. Pontuar alguém pela idade ou pelo sexo é discriminação.
alter table public.candidatos add column if not exists sexo               text;
alter table public.candidatos add column if not exists data_nascimento    date;
alter table public.candidatos add column if not exists demografia_origem  text;
alter table public.candidatos add column if not exists demografia_lida_em timestamptz;

comment on column public.candidatos.sexo is
  'M ou F, lido do BI. Só para estatística agregada - nunca entra na pontuação.';
comment on column public.candidatos.data_nascimento is
  'Lida do BI. Só para o escalão etário no Dashboard - nunca entra na pontuação.';
comment on column public.candidatos.demografia_origem is
  'bi-ocr quando foi o sistema a ler, manual quando foi corrigida por uma pessoa.';

-- Só se aceitam os dois valores, ou nada. Uma coluna de texto livre acabava
-- com "M", "m", "Masc", "masculino" e quatro barras no mesmo gráfico.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'candidatos_sexo_valido'
  ) then
    alter table public.candidatos
      add constraint candidatos_sexo_valido check (sexo is null or sexo in ('M','F'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'candidatos_demografia_origem_valida'
  ) then
    alter table public.candidatos
      add constraint candidatos_demografia_origem_valida
      check (demografia_origem is null or demografia_origem in ('bi-ocr','manual'));
  end if;
end $$;

-- Uma data de nascimento fora deste intervalo é erro de leitura, não pessoa.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'candidatos_nascimento_plausivel'
  ) then
    alter table public.candidatos
      add constraint candidatos_nascimento_plausivel
      check (
        data_nascimento is null
        or (data_nascimento > date '1935-01-01' and data_nascimento < current_date - interval '14 years')
      );
  end if;
end $$;

-- O Dashboard reparte por estas três colunas. Sem índice, cada abertura
-- varria a tabela toda.
create index if not exists idx_candidatos_status      on public.candidatos (status);
create index if not exists idx_candidatos_sexo        on public.candidatos (sexo) where sexo is not null;
create index if not exists idx_candidatos_nascimento  on public.candidatos (data_nascimento) where data_nascimento is not null;

-- ----------------------------------------------------------------- SEMENTE
-- Se a linha única ainda não existir, cria-se agora: sem ela os updates
-- abaixo não tinham onde escrever e o funil ficava sempre nos valores de
-- origem, sem nunca dar erro nenhum - o pior dos dois mundos.
insert into public.definicoes (id)
select true
where not exists (select 1 from public.definicoes where id = true);

-- Os valores de omissão só se gravam se ainda não houver nada configurado.
-- Quem já tiver afinado o funil no painel não o perde ao correr isto outra vez.
update public.definicoes
   set funil = '[
  {"chave":"candidaturas","ordem":1,"nome":"Candidaturas","perdeSeAqui":"porta de entrada: tudo o que chega pelo formulário","taxaPrevista":null,"cor":"#8496A6","estados":["Identificado","Contactado","Entrevistado","Seleccionado","Contratado"],"activo":true},
  {"chave":"pre_seleccao","ordem":2,"nome":"Pré-selecção","perdeSeAqui":"documento em falta, perfil fora da vaga ou residência fora da área","taxaPrevista":55,"cor":"#8A6208","estados":["Contactado","Entrevistado","Seleccionado","Contratado"],"activo":true},
  {"chave":"entrevista","ordem":3,"nome":"Entrevista","perdeSeAqui":"não comparece, não atende, ou desiste ao saber as condições","taxaPrevista":70,"cor":"#2E5C8A","estados":["Entrevistado","Seleccionado","Contratado"],"activo":true},
  {"chave":"formacao","ordem":4,"nome":"Formação","perdeSeAqui":"a selecção propriamente dita, feita depois da entrevista","taxaPrevista":75,"cor":"#7A4E8F","estados":["Seleccionado","Contratado"],"activo":true},
  {"chave":"teste_fluxo","ordem":5,"nome":"Teste de fluxo interno","perdeSeAqui":"faltas e desistências ao longo dos módulos - agrava-se por ainda não haver contrato assinado","taxaPrevista":88,"cor":"#1F7A8C","estados":["Seleccionado","Contratado"],"activo":true},
  {"chave":"avaliacao","ordem":6,"nome":"Avaliação","perdeSeAqui":"não conclui os dias de terreno da avaliação","taxaPrevista":95,"cor":"#2E8B57","estados":["Seleccionado","Contratado"],"activo":true},
  {"chave":"contratacao","ordem":7,"nome":"Contratação","perdeSeAqui":"não confirmado no teste de fluxo, ou recusa o contrato","taxaPrevista":85,"cor":"#1C6B53","estados":["Contratado"],"activo":true}
]'::jsonb
 where id = true and funil is null;

update public.definicoes
   set estados = '[
  {"chave":"Identificado","ordem":1,"nome":"Identificado","cor":"#8496A6","proximoPasso":"contactar e marcar entrevista","terminal":false,"aliases":["Pendente"],"activo":true},
  {"chave":"Contactado","ordem":2,"nome":"Contactado","cor":"#8A6208","proximoPasso":"entrevistar","terminal":false,"aliases":[],"activo":true},
  {"chave":"Entrevistado","ordem":3,"nome":"Entrevistado","cor":"#2E5C8A","proximoPasso":"decidir e seleccionar","terminal":false,"aliases":[],"activo":true},
  {"chave":"Seleccionado","ordem":4,"nome":"Seleccionado","cor":"#7A4E8F","proximoPasso":"fechar proposta e contratar","terminal":false,"aliases":["Aprovado"],"activo":true},
  {"chave":"Contratado","ordem":5,"nome":"Contratado","cor":"#1C6B53","proximoPasso":"convocar para a formação","terminal":false,"aliases":[],"activo":true},
  {"chave":"Recusado","ordem":6,"nome":"Recusado","cor":"#A32C2C","proximoPasso":"-","terminal":true,"aliases":["Reprovado"],"activo":true},
  {"chave":"Desistiu","ordem":7,"nome":"Desistiu","cor":"#B4553A","proximoPasso":"repor a vaga","terminal":true,"aliases":[],"activo":true}
]'::jsonb
 where id = true and estados is null;

update public.definicoes
   set graficos = '[
  {"id":"g-sexo","titulo":"Repartição por sexo","campo":"sexo","agregacao":"contagem","feitio":"anel","topo":8},
  {"id":"g-idade","titulo":"Escalão etário","campo":"escalao","agregacao":"contagem","feitio":"barras","topo":8},
  {"id":"g-pontuacao","titulo":"Faixa de pontuação","campo":"faixaPontuacao","agregacao":"contagem","feitio":"barras","topo":8},
  {"id":"g-municipio","titulo":"Município de residência","campo":"municipio","agregacao":"contagem","feitio":"barrasH","topo":8},
  {"id":"g-mtbt","titulo":"Conhece redes MT/BT","campo":"conheceMtBt","agregacao":"contagem","feitio":"anel","topo":8},
  {"id":"g-escolaridade","titulo":"Nível académico","campo":"nivelAcademico","agregacao":"contagem","feitio":"barrasH","topo":6},
  {"id":"g-experiencia","titulo":"Pontuação média por experiência na área","campo":"experienciaSimilar","agregacao":"mediaPontuacao","feitio":"barras","topo":8}
]'::jsonb
 where id = true and graficos is null;


---------------------------------------------------------------------------
-- 20260922d_equipa_entrevista.sql
---------------------------------------------------------------------------

-- ===========================================================================
-- EQUIPA DE ENTREVISTA - um a três recrutadores por entrevista
-- ---------------------------------------------------------------------------
-- Só acrescenta. A coluna `recrutador` fica onde estava e continua a guardar
-- o RESPONSÁVEL: tudo o que já a lia continua a ler a mesma coisa. A coluna
-- nova guarda o painel inteiro.
--
-- Correr duas vezes é seguro.
-- ===========================================================================

alter table public.atribuicoes_entrevista
  add column if not exists recrutadores text[];

comment on column public.atribuicoes_entrevista.recrutadores is
  'A equipa que conduz a entrevista, de 1 a 3 pessoas. O primeiro é o mesmo que está em `recrutador` e é quem responde pelo processo. Nulo ou vazio quer dizer "só o recrutador".';

-- No máximo três. A regra vive aqui também, e não só no código: uma acção
-- nova escrita daqui a um ano não pode furar o limite sem dar por isso.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'atribuicao_equipa_ate_tres'
  ) then
    alter table public.atribuicoes_entrevista
      add constraint atribuicao_equipa_ate_tres
      check (recrutadores is null or array_length(recrutadores, 1) between 1 and 3);
  end if;
end $$;

-- Encontrar as entrevistas de uma pessoa passa a ser uma pergunta sobre o
-- array. Sem índice GIN, cada abertura da lista varria a tabela inteira.
create index if not exists idx_atribuicao_equipa
  on public.atribuicoes_entrevista using gin (recrutadores);

-- ----------------------------------------------------------------- SEMENTE
-- As atribuições que já existem passam a ter equipa de um: o responsável que
-- já lá estava. Sem isto, nada muda de comportamento, mas as leituras ficam
-- todas a depender do caminho de recurso.
update public.atribuicoes_entrevista
   set recrutadores = array[recrutador]
 where recrutador is not null
   and (recrutadores is null or array_length(recrutadores, 1) is null);

---------------------------------------------------------------------------
-- 20260922e_modalidade_entrevista.sql
---------------------------------------------------------------------------

-- ===========================================================================
-- COMO SE FAZ A ENTREVISTA: videochamada ou chamada telefónica
-- ---------------------------------------------------------------------------
-- Só ACRESCENTA. Nada se apaga, nada muda de tipo, e correr duas vezes é
-- seguro.
--
-- As entrevistas marcadas antes disto ficam com a modalidade a nulo, que se
-- lê como "à maneira antiga": remarcam-se normalmente e não contam tentativas
-- nenhumas. Nenhuma marcação que já exista muda de comportamento.
-- ===========================================================================

-- --------------------------------------------------------------- CANDIDATOS
alter table public.candidatos
  add column if not exists entrevista_modalidade text,
  add column if not exists entrevista_link       text,
  add column if not exists chamada_tentativas    integer not null default 0,
  add column if not exists chamada_atendeu       boolean not null default false;

comment on column public.candidatos.entrevista_modalidade is
  'videochamada (Google Meet) ou chamada (telefone). Nulo = marcação anterior a esta funcionalidade.';
comment on column public.candidatos.entrevista_link is
  'Link da videochamada enviado ao candidato. Só se preenche na modalidade videochamada.';
comment on column public.candidatos.chamada_tentativas is
  'Quantas vezes já se ligou. Ao chegar a 3 sem atender, NÃO há remarcação - a regra vive em src/lib/entrevista/modalidade.ts e é conferida no servidor.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'candidatos_modalidade_valida') then
    alter table public.candidatos
      add constraint candidatos_modalidade_valida
      check (entrevista_modalidade is null or entrevista_modalidade in ('videochamada','chamada'));
  end if;

  -- Um contador nunca é negativo, e passar de três é sinal de que alguma
  -- coisa escreveu à revelia da regra. A base recusa as duas coisas.
  if not exists (select 1 from pg_constraint where conname = 'candidatos_tentativas_ate_tres') then
    alter table public.candidatos
      add constraint candidatos_tentativas_ate_tres
      check (chamada_tentativas between 0 and 3);
  end if;
end $$;

-- ------------------------------------------------------------------ EVENTOS
-- A marcação guarda a modalidade com que foi feita. Sem isto, mudar a
-- modalidade de um candidato reescrevia a história das marcações anteriores.
alter table public.eventos_candidato
  add column if not exists modalidade text,
  add column if not exists link       text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eventos_modalidade_valida') then
    alter table public.eventos_candidato
      add constraint eventos_modalidade_valida
      check (modalidade is null or modalidade in ('videochamada','chamada'));
  end if;
end $$;

-- ------------------------------------------------- REGISTO DAS TENTATIVAS
-- Append-only. O contador em `candidatos` responde depressa à pergunta
-- "quantas já foram?"; esta tabela responde à pergunta que vem a seguir, e
-- que é a que interessa quando alguém reclama: "quem ligou, quando, e o que
-- aconteceu?". Um número sozinho não se defende; uma lista defende-se.
create table if not exists public.tentativas_chamada (
  id           uuid primary key default gen_random_uuid(),
  quando       timestamptz not null default now(),
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  numero       integer not null check (numero between 1 and 3),
  resultado    text not null check (resultado in (
                 'atendeu','nao_atendeu','desligado','numero_errado','pediu_para_ligar_depois'
               )),
  quem         text,
  observacoes  text
);

create index if not exists idx_tentativas_candidato
  on public.tentativas_chamada (candidato_id, numero);

comment on table public.tentativas_chamada is
  'Cada tentativa de chamada, uma linha. Nada aqui se altera nem se apaga.';

alter table public.tentativas_chamada enable row level security;

---------------------------------------------------------------------------
-- 20260922f_sala_meet_e_escolha.sql
---------------------------------------------------------------------------

-- ===========================================================================
-- SALA DO MEET GERADA PELO CALENDAR, E A ESCOLHA DO CANDIDATO
-- ---------------------------------------------------------------------------
-- Só ACRESCENTA. Correr duas vezes é seguro.
--
-- Duas coisas:
--   1. o evento do Google guarda-se, para a sala se poder apagar ao remarcar
--      em vez de ficar uma agenda cheia de salas órfãs;
--   2. a modalidade ganha um terceiro valor, `por_escolher`, que é o estado
--      em que o candidato fica logo a seguir ao email: já foi convidado, ainda
--      não disse como prefere.
-- ===========================================================================

alter table public.candidatos
  add column if not exists entrevista_evento_google text,
  add column if not exists modalidade_escolhida_em  timestamptz,
  add column if not exists modalidade_escolhida_por text;

comment on column public.candidatos.entrevista_evento_google is
  'Id do evento no Google Calendar que criou a sala do Meet. Serve para a apagar quando a entrevista é remarcada.';
comment on column public.candidatos.modalidade_escolhida_em is
  'Quando a equipa registou a escolha que o candidato mandou por email. Nulo enquanto a resposta não chegar.';

alter table public.eventos_candidato
  add column if not exists evento_google text;

-- ------------------------------------------------- O TERCEIRO VALOR
-- `por_escolher`: o email já saiu com as duas opções e o candidato ainda não
-- respondeu. Distingue-se de NULO, que continua a querer dizer "marcação
-- anterior a esta funcionalidade" e não muda de comportamento nenhum.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'candidatos_modalidade_valida') then
    alter table public.candidatos drop constraint candidatos_modalidade_valida;
  end if;

  alter table public.candidatos
    add constraint candidatos_modalidade_valida
    check (entrevista_modalidade is null
           or entrevista_modalidade in ('videochamada','chamada','por_escolher'));

  if exists (select 1 from pg_constraint where conname = 'eventos_modalidade_valida') then
    alter table public.eventos_candidato drop constraint eventos_modalidade_valida;
  end if;

  alter table public.eventos_candidato
    add constraint eventos_modalidade_valida
    check (modalidade is null
           or modalidade in ('videochamada','chamada','por_escolher'));
end $$;

-- Quem ainda não escolheu é a lista de trabalho de todos os dias até as
-- respostas chegarem. Sem índice, essa lista varria a tabela inteira.
create index if not exists idx_candidatos_por_escolher
  on public.candidatos (entrevista_modalidade)
  where entrevista_modalidade = 'por_escolher';
