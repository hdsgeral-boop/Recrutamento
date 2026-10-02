-- ============================================================================
-- CONSULVOLT - PLATAFORMA DE RECRUTAMENTO MULTI-CONCURSO
-- Fase 2: Configuração por concurso (modelos de email, remetentes e parâmetros)
-- ----------------------------------------------------------------------------
-- IDEMPOTENTE: pode ser corrido mais de uma vez sem apagar nada e sem duplicar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABELA DE MODELOS DE EMAIL POR CONCURSO
-- ----------------------------------------------------------------------------

create table if not exists public.modelos_email (
  id             uuid primary key default gen_random_uuid(),
  concurso_id    uuid not null references public.concursos(id) on delete cascade,
  tipo           text not null check (tipo in (
                   'confirmacao','aprovacao','entrevista','reprovacao',
                   'personalizado','rh','formacao','teste_fluxo','reuniao','agradecimento'
                 )),
  assunto        text not null,
  corpo_html     text not null,
  corpo_texto    text,
  actualizado_em timestamptz not null default now(),
  actualizado_por text,
  constraint modelos_email_tipo_concurso_unico unique (concurso_id, tipo)
);

create index if not exists idx_modelos_email_concurso
  on public.modelos_email (concurso_id, tipo);

comment on table public.modelos_email is
  'Modelos de email configuráveis por concurso. O sistema interpola {{variaveis}} ao enviar.';

-- RLS
alter table public.modelos_email enable row level security;

drop policy if exists "so_o_proprio_concurso_modelos_email" on public.modelos_email;
create policy "so_o_proprio_concurso_modelos_email"
  on public.modelos_email
  for all to authenticated
  using (concurso_id = public.concurso_actual())
  with check (concurso_id = public.concurso_actual());

-- ----------------------------------------------------------------------------
-- 2. SEMENTE DOS MODELOS INICIAIS PARA O CONCURSO BENGO
-- ----------------------------------------------------------------------------
do $$
declare
  v_concurso_id uuid;
begin
  select id into v_concurso_id from public.concursos where slug = 'bengo' limit 1;

  if v_concurso_id is not null then
    -- 2.1 Confirmação de candidatura
    insert into public.modelos_email (concurso_id, tipo, assunto, corpo_html, corpo_texto)
    values (
      v_concurso_id,
      'confirmacao',
      'Candidatura Recebida - {{vaga}} ({{referencia}})',
      '<p>Olá <strong>{{nome}}</strong>,</p><p>Confirmamos que a tua candidatura à vaga de <strong>{{vaga}}</strong> ({{projecto}}) foi registada com sucesso.</p><p>A nossa equipa de Recursos Humanos vai analisar o teu perfil e os documentos enviados. Se fores seleccionado para a fase seguinte, entraremos em contacto por esta via.</p>',
      'Olá {{nome}}, confirmamos que a tua candidatura à vaga de {{vaga}} foi registada com sucesso. Entraremos em contacto caso avances no processo.'
    )
    on conflict (concurso_id, tipo) do nothing;

    -- 2.2 Convocatória de entrevista
    insert into public.modelos_email (concurso_id, tipo, assunto, corpo_html, corpo_texto)
    values (
      v_concurso_id,
      'entrevista',
      'Convocatória para Entrevista - {{vaga}}',
      '<p>Olá <strong>{{nome}}</strong>,</p><p>Temos o prazer de te convocar para a entrevista de selecção para a vaga de <strong>{{vaga}}</strong>.</p><p><strong>Data e Hora:</strong> {{data_hora}}<br/><strong>Modalidade:</strong> {{modalidade}}<br/><strong>Local / Ligação:</strong> {{local_ou_link}}</p><p>{{notas}}</p>',
      'Olá {{nome}}, foste convocado para a entrevista de selecção em {{data_hora}}. Modalidade: {{modalidade}}.'
    )
    on conflict (concurso_id, tipo) do nothing;

    -- 2.3 Agradecimento pós-entrevista
    insert into public.modelos_email (concurso_id, tipo, assunto, corpo_html, corpo_texto)
    values (
      v_concurso_id,
      'agradecimento',
      'Agradecimento pela Entrevista - {{vaga}}',
      '<p>Olá <strong>{{nome}}</strong>,</p><p>Agradecemos a tua presença e participação na entrevista de hoje para a vaga de <strong>{{vaga}}</strong>.</p><p>A equipa está a concluir a ronda de avaliações e comunicará a decisão assim que o processo de selecção estiver fechado.</p>',
      'Olá {{nome}}, obrigado pela tua participação na entrevista de hoje para a vaga de {{vaga}}.'
    )
    on conflict (concurso_id, tipo) do nothing;

    -- 2.4 Não seleccionado / reprovação
    insert into public.modelos_email (concurso_id, tipo, assunto, corpo_html, corpo_texto)
    values (
      v_concurso_id,
      'reprovacao',
      'Actualização sobre a tua Candidatura - {{vaga}}',
      '<p>Olá <strong>{{nome}}</strong>,</p><p>Agradecemos o teu interesse e o tempo dedicado ao processo de recrutamento para <strong>{{vaga}}</strong>.</p><p>Após cuidada análise, informamos que optámos por avançar com outros perfis cujas competências se alinham mais de perto com as necessidades imediatas do terreno.</p><p>Guardaremos o teu currículo na nossa base de dados para futuras oportunidades.</p>',
      'Olá {{nome}}, agradecemos o teu interesse no processo para {{vaga}}. Decidimos avançar com outros perfis para esta vaga.'
    )
    on conflict (concurso_id, tipo) do nothing;
  end if;
end $$;
