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
