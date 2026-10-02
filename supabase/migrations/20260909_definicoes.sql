-- ============================================================================
-- DEFINIÇÕES DO RECRUTAMENTO
-- ----------------------------------------------------------------------------
-- Tira o prazo das candidaturas de dentro do código e põe-no numa linha da
-- base de dados, para poder ser mudado em /admin/definicoes sem novo deploy.
--
-- Nada se apaga e nada se altera nas tabelas existentes: isto só acrescenta
-- uma tabela nova. Correr o ficheiro duas vezes não estraga nada.
--
-- O prazo fica em 12 de Setembro de 2026, que são os dois dias acrescentados
-- aos 10 de Setembro que estavam no código.
-- ============================================================================

create table if not exists public.definicoes (
  -- Chave booleana com CHECK: é o truque que garante que só pode existir uma
  -- linha nesta tabela. Sem isto, um segundo INSERT criava uma segunda
  -- configuração e o sistema passava a ler uma delas ao calhas.
  id                   boolean primary key default true check (id),
  prazo_candidaturas   timestamptz,
  candidaturas_abertas boolean not null default true,
  mensagem_encerrado   text,
  actualizado_em       timestamptz not null default now(),
  actualizado_por      text
);

comment on table public.definicoes is
  'Linha única com as definições do recrutamento. O prazo aqui manda sobre o valor que está no código.';
comment on column public.definicoes.candidaturas_abertas is
  'Interruptor para fechar antes do prazo. Falso fecha o formulário de imediato.';
comment on column public.definicoes.mensagem_encerrado is
  'Aviso mostrado a quem chega depois do fecho. Vazio usa o texto padrão.';

-- A linha nasce já com os dois dias acrescentados. O `do nothing` faz com que
-- correr isto outra vez não reponha o prazo por cima do que for definido no
-- painel entretanto - seria a maneira mais fácil de desfazer o trabalho de
-- outra pessoa sem dar por isso.
insert into public.definicoes (id, prazo_candidaturas, candidaturas_abertas)
values (true, timestamptz '2026-09-12 00:00:00+01', true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
-- O painel lê e escreve com a service_role, que ignora o RLS. Ligamos o RLS
-- na mesma e não criamos política de escrita nenhuma: assim, se um dia a
-- chave pública for parar ao sítio errado, ninguém muda o prazo por fora.
alter table public.definicoes enable row level security;

drop policy if exists "definicoes_leitura_publica" on public.definicoes;
create policy "definicoes_leitura_publica"
  on public.definicoes for select to anon, authenticated using (true);

select prazo_candidaturas, candidaturas_abertas from public.definicoes;
