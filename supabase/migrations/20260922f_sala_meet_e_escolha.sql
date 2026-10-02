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
