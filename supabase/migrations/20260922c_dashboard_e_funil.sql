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
