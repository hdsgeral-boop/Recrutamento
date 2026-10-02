# Plataforma de recrutamento multi-concurso

Como transformar o sistema do Projeto Bengo numa plataforma onde cada
concurso novo é uma linha na base de dados, com o seu próprio endereço e os
seus próprios dados, sobre um código só.

---

## 1. A decisão que governa tudo o resto

Há três maneiras de separar concursos, e duas delas estão fechadas por limites
reais das plataformas que usas hoje.

### A. Uma instalação por concurso (o que fazes hoje)

Copiar o repositório, criar um projecto Vercel novo, criar um projecto Supabase
novo. Isolamento perfeito: é impossível os dados de um concurso aparecerem no
outro, porque são bases diferentes.

**O custo já é visível.** O Bengo e o UGP são duas cópias do mesmo sistema, e já
divergiram: o UGP tem `enderecoDeResposta` que o Bengo não tem, o Bengo tem
`entrevista_modalidade` que o UGP não tem. Cada correcção tem de ser aplicada
duas vezes à mão, e duas vezes é o número em que isso ainda se consegue fazer.
A dez concursos é impossível.

**E está fechada:** o plano gratuito do Supabase permite **2 projectos activos
por organização**. Já tens dois. O terceiro concurso não tem onde viver.

### B. Uma base de dados por concurso, um código só

O código é um só e descobre, pelo endereço, a que base se liga. Mantém o
isolamento físico e resolve a duplicação de código.

**Fechada pelo mesmo limite dos 2 projectos**, e no plano pago cada base custa
por si. Para dez concursos são dez bases para migrar sempre que o esquema muda.

### C. Uma base, muitos concursos, isolados por linha

Cada tabela ganha uma coluna `concurso_id`, e a própria base de dados recusa
devolver linhas de um concurso a quem está noutro. Um subdomínio por concurso.
Criar um concurso novo é inserir uma linha.

**É esta.** Não por ser a mais elegante, mas porque é a única que cabe nos
limites e porque o custo de manutenção não cresce com o número de concursos.

> **O risco, dito com todas as letras:** nesta arquitectura, a separação dos
> dados passa a ser uma regra de software em vez de uma parede física. Uma
> política em falta e o CV de um candidato de um concurso aparece noutro. Isto
> não se resolve com cuidado: resolve-se com políticas na base de dados (não só
> filtros na aplicação) e com um teste que tenta mesmo atravessar a parede e
> falha se conseguir.

---

## 2. O que já está pronto, e é mais do que parece

A parte difícil do sistema já está escrita de maneira a transferir-se sem
alterações: são funções puras, que não conhecem base de dados nem ecrã, e que
já têm testes.

| Biblioteca | O que faz | Muda para multi-concurso? |
| --- | --- | --- |
| `entrevista/planear.ts` | Gera a agenda a partir de recrutadores, dias e janela | Não |
| `entrevista/conflitos.ts` | Decide se duas entrevistas se sobrepõem | Não |
| `entrevista/estados.ts` | A máquina de estados da candidatura | Não |
| `entrevista/lotes-envio.ts` | Agrupa envios e classifica falhas | Não |
| `comunicacoes/sequenciador.ts` | Percorre os grupos com pausas, trava na quota | Não |
| `comunicacoes/avisado-da-hora-certa.ts` | Quem falta avisar | Não |
| `comunicacoes/falhas.ts` | Que falhas continuam de pé | Não |
| `ranking/pontuacao.ts` | A rubrica, versionada | Passa a escolher a rubrica pelo concurso |
| `datas.ts` | Tudo fixado em Africa/Luanda | Não |

Isto é a maior parte do valor do sistema e atravessa a mudança intacto. É o
argumento mais forte de que esta transformação é viável em semanas e não em
meses.

**O que é mesmo de um concurso só hoje:**

- `definicoes` é uma linha única (`id: true`) - o sinal mais claro de que o
  sistema foi feito para um projecto
- `EMPRESA` em `constantes.ts` está escrito no código
- a lista de províncias e municípios está no código
- os textos dos emails estão no código
- `utilizadores_painel` é global à instalação
- a versão da rubrica (`bengo-v1`, `ugp-e1`) está escolhida no código

---

## 3. O modelo de dados

### Tabelas novas

```sql
organizacoes
  id, nome, nif, logotipo_url, cor_principal, criada_em

concursos                       -- isto é "o projecto"
  id, organizacao_id, slug, dominio,
  nome,                         -- "Técnico de Cadastro - Bengo"
  vaga_titulo, vaga_descricao,
  estado,                       -- rascunho | aberto | fechado | arquivado
  prazo_candidaturas, vagas_previstas,
  rubrica_versao,               -- qual rubrica pontua este concurso
  roteiro_id,                   -- qual guião de entrevista
  janela_abertura, janela_fecho,        -- 09:00 / 15:30
  duracao_entrevista_min, descanso_min, -- 15 / 5
  modalidade_padrao,            -- chamada | videochamada | presencial
  remetente_nome, remetente_email,
  criado_em

membros                         -- quem vê o quê
  id, utilizador_id, concurso_id, papel, criado_em

formulario_campos               -- o formulário deixa de ser código
  id, concurso_id, chave, rotulo, tipo, obrigatorio, opcoes jsonb, ordem

modelos_email                   -- os textos deixam de ser código
  id, concurso_id, tipo, assunto, corpo_html, corpo_texto
```

### Tabelas existentes

Todas ganham a mesma coluna:

```sql
alter table public.candidatos
  add column concurso_id uuid not null references public.concursos(id);
create index on public.candidatos (concurso_id);
```

O mesmo para `atribuicoes_entrevista`, `avaliacoes_entrevista`,
`analises_candidato`, `emails_enviados`, `eventos_candidato`,
`historico_entrevista`, `roteiros_entrevista`, `documentos_texto`.

A `definicoes`, que hoje é uma linha única, desaparece: o que lá está passa para
colunas de `concursos`.

### A regra que substitui a confiança

```sql
-- O concurso de quem está a pedir. Vem do JWT ou de uma definição de sessão,
-- nunca de um parâmetro que o browser possa escolher.
create or replace function public.concurso_actual() returns uuid ...

create policy "so o proprio concurso" on public.candidatos
  for all
  using      (concurso_id = public.concurso_actual())
  with check (concurso_id = public.concurso_actual());
```

**O `with check` não é decorativo.** Sem ele, cada um lê só o seu mas pode
ESCREVER no concurso do vizinho. É o erro mais comum nesta arquitectura.

---

## 4. Os endereços

```
bengo.recrutar.co.ao      ->  concurso slug = bengo
ugp.recrutar.co.ao        ->  concurso slug = ugp
epal-2027.recrutar.co.ao  ->  concurso slug = epal-2027
```

DNS com `*.recrutar.co.ao` a apontar para um projecto Vercel só. O middleware lê
o subdomínio, procura o concurso, e fixa-o para o resto do pedido. **Criar um
concurso novo não leva deploy nenhum** - é uma linha na tabela.

Alternativa mais simples, se não quiseres mexer em DNS com wildcard:
`recrutar.co.ao/bengo`. Funciona igual, mas o candidato sente menos que é o
site daquele concurso. O subdomínio é melhor para quem se candidata; o caminho é
melhor para começar depressa.

---

## 5. O que custa

Esta é a parte que convém saber antes de começar, não a meio.

| | Hoje | Como plataforma |
| --- | --- | --- |
| Supabase | Gratuito, 2 projectos | **Pro, 25 USD/mês** - o gratuito permite 2 projectos activos e pausa ao fim de 1 semana sem uso |
| Vercel | Hobby, gratuito | **Pro, 20 USD/mês por utilizador** - o Hobby é, por regra da Vercel, **só para uso não comercial** |
| Email | Gmail com palavra-passe de aplicação | Serviço transaccional - o Gmail gratuito entrega **500 destinatários por dia** e já foi o teu limite uma vez |

**Cerca de 45 a 50 USD por mês**, mais o email. O plano gratuito deixa de dar
para isto, e é melhor decidir isso de olhos abertos do que descobrir quando um
concurso parar a meio.

Nota prática boa: na Vercel, o tempo máximo de uma função é de 300 segundos
(5 minutos), e não os 60 que o sistema usa hoje. O sequenciador de emails pode
mandar lotes bem maiores por pedido.

---

## 6. Como lá chegar sem partir nada

O Bengo tem entrevistas a decorrer. A migração não pode ser um salto.

1. **Repositório novo**, a partir do código do Bengo (está à frente do UGP).
2. **Reconciliar o que só o UGP tem** (`enderecoDeResposta`, o rodapé de não
   responder). Juntar primeiro, separar depois.
3. **Camada de concurso**: tabelas novas, `concurso_id` em todo o lado, RLS,
   middleware. Sem funcionalidades novas nesta fase.
4. **Importar o Bengo** como concurso 1 para uma base NOVA, e comparar contagem
   a contagem com a base antiga antes de desligar seja o que for.
5. **Importar o UGP** como concurso 2.
6. **Mudar o DNS** só quando os dois estiverem a responder certo em paralelo.

Durante os passos 1 a 5 o Bengo actual continua no ar, intocado.

---

## 7. Os riscos, sem adoçar

1. **O RLS é toda a segurança.** Vale a pena um teste que entra como concurso A
   e tenta ler o concurso B, e que falha a compilação se conseguir.
2. **A divergência entre Bengo e UGP já existe** e reconciliá-la é trabalho real,
   não um `cp`.
3. **A quota de email passa a ser partilhada** entre concursos se o remetente for
   o mesmo. Com três concursos a avisar no mesmo dia, os 500 do Gmail acabam a
   meio do segundo.
4. **O construtor de formulários é o maior item de âmbito.** Sugestão: na
   primeira versão, o formulário de cada concurso é um JSON de configuração, não
   um editor visual. O editor vem depois, se fizer falta.
5. **A rubrica por concurso** precisa de um registo de rubricas: a pontuação é
   TypeScript, não dados, e tem de continuar a ser (é o que a torna defensável
   perante quem reclame da nota).

---

## 8. Faseamento

| Fase | O que entrega | Pode parar aqui? |
| --- | --- | --- |
| 1. Esqueleto | Concursos, RLS, subdomínios, Bengo migrado | Sim, já vale |
| 2. Configuração | Marca, prazo, janela, recrutadores, textos de email por concurso | Sim |
| 3. Formulário | Campos por configuração | Sim |
| 4. Rubrica | Registo de rubricas por concurso | Sim |
| 5. Self-service | Criar um concurso pelo painel, sem programador | O objectivo |

Cada fase deixa o sistema inteiro e utilizável. Nenhuma obriga à seguinte.

---

## 9. As invariantes que o sistema novo tem de herdar

Isto não são boas práticas gerais: é a lista do que já correu mal neste sistema
em concreto, e que não pode voltar a correr.

1. **"Já foi avisado" compara sempre com o momento em que a coisa mudou**, nunca
   com uma data escolhida à mão. Um email é o retrato de um instante e só vale
   para o estado que existia quando saiu.
2. **Uma lista de estados vive num sítio só**, e a base de dados tem a mesma
   lista. Se divergirem, o painel deixa marcar e o servidor recusa.
3. **Choque é sobreposição** (duração mais folga), nunca a caixa da hora.
4. **Toda a data leva o fuso escrito** (`+01:00`). O servidor corre em UTC e,
   sem isso, os emails anunciam a hora errada.
5. **Uma ligação SMTP por lote**, não por mensagem, e a quota do dia conta-se
   antes de começar.
6. **Uma mensagem de erro nunca culpa o utilizador** por um problema do servidor.
7. **O painel nunca diz "gravado"** quando a base de dados recusou.
8. **A lógica dura vive em funções puras**, testáveis sem base de dados.
9. **Os testes derivam os números esperados dos dados**, nunca os fixam à mão.
10. **Marcações em lote aplicam-se por esta ordem**: largar as horas, fixar os
    recrutadores, só depois gravar as horas.
11. **Sem travessões.** Hífen sempre. Comentários e interface em Português de
    Angola.

---

## 10. O prompt, para quando quiseres executar

Copia daqui para baixo.

---

### CONTEXTO

Tenho um sistema de recrutamento em produção, feito para um concurso só, e quero
transformá-lo numa plataforma onde cada concurso novo é uma linha na base de
dados, com o seu próprio endereço e os seus próprios dados, sobre um código só.

O sistema actual: Next.js 14 App Router, TypeScript, TailwindCSS, shadcn/ui,
Supabase (Postgres + Storage), Server Actions, Google Drive por OAuth2, Gmail por
SMTP. Tem formulário público de candidatura, painel de administração com papéis,
ranking analítico com rubrica versionada, marcação e reorganização de entrevistas
em lote, e envio de emails por grupos.

Existem hoje duas instalações do mesmo código, que já divergiram entre si.

### OBJECTIVO

Uma plataforma multi-concurso com:

- um código só e um deployment só
- um subdomínio por concurso (`{slug}.dominio.ao`), resolvido em middleware
- dados completamente separados entre concursos, garantidos pela base de dados
  e não apenas por filtros na aplicação
- criar um concurso novo sem fazer deploy

### ARQUITECTURA DECIDIDA

Uma base de dados, muitos concursos, isolados por linha com Row Level Security.
Esta decisão já está tomada: o plano gratuito do Supabase permite 2 projectos
activos, portanto uma base por concurso não é possível.

Tabelas novas: `organizacoes`, `concursos`, `membros`, `formulario_campos`,
`modelos_email`. Todas as tabelas existentes ganham `concurso_id uuid not null`
com índice. A tabela `definicoes`, hoje de linha única, passa a colunas de
`concursos`.

Toda a tabela com `concurso_id` leva política RLS com `using` E `with check`. O
concurso actual vem do JWT ou de uma definição de sessão, nunca de um parâmetro
que o browser possa escolher.

### INVARIANTES QUE NÃO SE NEGOCEIAM

Cada uma destas é a correcção de um defeito que já existiu em produção. Trata-as
como requisitos, não como sugestões.

1. "Já foi avisado" compara sempre com o momento em que a coisa avisada mudou
   (o máximo entre `updated_at` da ficha e `actualizada_em` da atribuição), nunca
   com uma data escolhida à mão. Sem data utilizável, assume-se NÃO avisado.
2. Listas de estados ("ainda está de pé", "é terminal") vivem numa constante só,
   exportada, e a base de dados tem uma função com a mesma lista. Um teste fixa
   as duas e lembra de mudar ambas.
3. Choque entre entrevistas é sobreposição de intervalos com folga, nunca
   igualdade de hora truncada.
4. Todas as datas levam fuso explícito. O servidor corre em UTC e a aplicação é
   para Angola (UTC+1, sem mudança de hora). Testes correm com `TZ=UTC` de
   propósito.
5. O envio de email usa uma ligação SMTP reutilizada (`pool: true`,
   `maxConnections: 1`, limite de ritmo), com uma repetição automática nos erros
   transitórios, e conta a quota diária antes de começar um lote.
6. A classificação de um erro de email lê o travão de ritmo (454, 421) ANTES do
   "invalid" genérico. Uma credencial recusada (535) é outra coisa.
7. Nenhuma mensagem de erro culpa o utilizador por um problema do servidor.
8. Nenhum ecrã diz "gravado" quando a escrita falhou. O erro aparece primeiro.
9. A lógica dura vive em funções puras, sem base de dados nem ecrã, com testes.
10. Os testes derivam os valores esperados dos dados de entrada. Fixar números à
    mão mede a semente, não o comportamento.
11. Aplicar marcações em lote faz-se por esta ordem: largar as horas, fixar os
    recrutadores, só depois gravar as horas. A ordem contrária faz dois
    candidatos caírem no mesmo recrutador à mesma hora num estado intermédio.
12. Sem travessões em lado nenhum. Hífen sempre. Comentários e interface em
    Português de Angola.

### O QUE É CONFIGURÁVEL POR CONCURSO

Marca (nome, logótipo, cor); título e descrição da vaga; prazo e número de vagas;
campos do formulário; versão da rubrica de pontuação; guião de entrevista; janela
de trabalho, duração da entrevista e descanso; modalidade por omissão; remetente
e textos dos emails; recrutadores.

### TRABALHO, POR FASES

Cada fase tem de deixar o sistema inteiro e utilizável.

- **Fase 1.** Tabelas novas, `concurso_id` em todo o lado, RLS com teste de
  atravessamento, middleware por subdomínio, e a instalação actual importada
  como primeiro concurso. Sem funcionalidades novas.
- **Fase 2.** Configuração por concurso: marca, prazo, janela, recrutadores,
  textos de email.
- **Fase 3.** Campos do formulário por configuração (JSON por concurso; o editor
  visual fica para depois).
- **Fase 4.** Registo de rubricas, escolhida por concurso.
- **Fase 5.** Criar um concurso pelo painel, sem programador.

### COMO QUERO QUE TRABALHES

- Antes de escrever código, mostra-me o plano da fase e espera que eu aprove.
- Lógica nova em funções puras, com testes, antes de a ligar a ecrãs.
- Prova que cada teste apanha mesmo o defeito: parte o código de propósito e
  mostra o teste a falhar.
- Migrações de base de dados idempotentes, testadas num Postgres local antes de
  tocarem em produção, e com conferência dentro da própria migração.
- Nunca apagues dados existentes. Nunca alteres o que já está a funcionar sem
  me dizeres primeiro.
- Comentários que expliquem PORQUÊ, não o quê.
- No fim de cada fase: testes a passar, build limpo, e um resumo do que mudou.

### PRIMEIRO PASSO

Lê o código actual e devolve-me:

1. O inventário do que é de um concurso só e tem de passar a ser por concurso.
2. O plano da Fase 1, ficheiro a ficheiro.
3. Os riscos que vês e que eu não mencionei.

Não escrevas código ainda.
