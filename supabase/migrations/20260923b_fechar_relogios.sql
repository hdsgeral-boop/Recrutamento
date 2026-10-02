-- ============================================================================
-- FECHAR OS RELÓGIOS QUE FICARAM A CONTAR
-- ----------------------------------------------------------------------------
-- Até agora ninguém carimbava o fim de uma entrevista. O painel começava a
-- contar quando ela abria e não tinha por onde parar: entrevistas guardadas
-- há dias continuavam a somar minutos no ecrã.
--
-- O sistema já carimba o fim a partir de agora. Isto trata das que ficaram
-- para trás.
--
-- A HORA NÃO É INVENTADA. Usa-se, por esta ordem:
--   1. a hora em que a avaliação foi guardada - guardar a avaliação é acabar
--      a entrevista, por isso é a hora certa e não uma aproximação;
--   2. para as que foram dadas por concluídas sem avaliação nenhuma, a hora
--      da última alteração do processo.
--
-- SÓ ACRESCENTA. Não toca em nenhuma entrevista a decorrer, não apaga nada,
-- não mexe em notas nem em marcações, e pode correr-se duas vezes: a segunda
-- passagem não encontra nada para fazer.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. As que têm avaliação guardada: a entrevista acabou quando ela foi gravada
-- ----------------------------------------------------------------------------
update public.atribuicoes_entrevista a
   set concluida_em  = v.quando,
       concluida_por = coalesce(a.concluida_por, v.avaliador, a.recrutador),
       estado        = 'concluida',
       actualizada_em = now()
  from (
    select candidato_id,
           min(criada_em) as quando,
           (array_agg(avaliador order by criada_em))[1] as avaliador
      from public.avaliacoes_entrevista
     group by candidato_id
  ) v
 where a.candidato_id = v.candidato_id
   and a.iniciada_em is not null
   and a.concluida_em is null
   -- Nunca para trás: uma avaliação gravada antes de a entrevista abrir seria
   -- um dado estranho, e fechá-la com essa hora dava uma duração negativa.
   and v.quando >= a.iniciada_em;

-- ----------------------------------------------------------------------------
-- 2. As dadas por concluídas sem avaliação: vale a última vez que se mexeu
-- ----------------------------------------------------------------------------
update public.atribuicoes_entrevista
   set concluida_em  = greatest(actualizada_em, iniciada_em),
       concluida_por = coalesce(concluida_por, recrutador),
       actualizada_em = now()
 where estado = 'concluida'
   and iniciada_em is not null
   and concluida_em is null;

-- ----------------------------------------------------------------------------
-- 3. As que têm avaliação mas com hora impossível (gravada antes de a
--    entrevista abrir). Não dá para saber quanto durou, mas dá para saber
--    que ACABOU - e um relógio parado sem duração fiável é melhor do que um
--    relógio a contar para sempre.
-- ----------------------------------------------------------------------------
update public.atribuicoes_entrevista a
   set concluida_em  = greatest(a.actualizada_em, a.iniciada_em),
       concluida_por = coalesce(a.concluida_por, a.recrutador),
       estado        = 'concluida',
       actualizada_em = now()
 where a.iniciada_em is not null
   and a.concluida_em is null
   and exists (select 1 from public.avaliacoes_entrevista v where v.candidato_id = a.candidato_id);

-- ----------------------------------------------------------------------------
-- CONFERIR
-- ----------------------------------------------------------------------------
-- 'a contar para sempre' tem de vir a ZERO. As que ficam em 'a decorrer' são
-- entrevistas mesmo a acontecer agora, e essas é suposto contarem.
select
  count(*) filter (where iniciada_em is not null and concluida_em is not null)
    as relogios_parados,
  count(*) filter (where estado = 'em_entrevista' and concluida_em is null)
    as a_decorrer,
  count(*) filter (
    where iniciada_em is not null and concluida_em is null
      and (estado = 'concluida'
           or exists (select 1 from public.avaliacoes_entrevista v
                       where v.candidato_id = atribuicoes_entrevista.candidato_id))
  ) as a_contar_para_sempre
from public.atribuicoes_entrevista;
