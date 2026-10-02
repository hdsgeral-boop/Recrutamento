# Ligar o Google Calendar para as salas do Meet

O sistema cria uma sala do Google Meet por candidato, à hora da entrevista
dele, e mete o link no email que lhe envia e no ecrã do recrutador.

Para isso precisa de autorização tua no Google. São seis passos e faz-se uma
vez. No fim há um botão no painel que confirma se ficou a funcionar.

---

## Antes de começares, o que é preciso saber

**Tem de ser a via OAuth, com uma conta de pessoa.** Criar uma sala do Meet é
um acto de um utilizador - a sala pertence a alguém. Uma conta de serviço não
é ninguém: não tem Meet, e o Calendar responde-lhe `Invalid conference type
value`. Não há volta a dar numa conta Google normal.

**O token que já existe não serve.** O refresh token que o sistema usa hoje
para o Drive foi emitido só para `drive.file`. Um token não ganha permissões
depois de emitido. Vais gerar um novo, com os dois âmbitos, e substituir o
antigo - o Drive continua a funcionar porque o novo token também leva
`drive.file`.

**Usa a conta que vai ser a dona das salas.** O melhor é a conta de
recrutamento da empresa, não a conta pessoal de alguém que pode sair.

---

## Passo 1 · Activar a Google Calendar API

1. Abre <https://console.cloud.google.com/>
2. Em cima, no selector de projectos, escolhe o **mesmo projecto** onde já
   configuraste o Google Drive.
3. Menu lateral: **APIs e serviços → Biblioteca**
4. Procura `Google Calendar API`
5. Abre e carrega em **Activar**

Se disser que já está activada, está feito.

---

## Passo 2 · Acrescentar o âmbito ao ecrã de consentimento

1. **APIs e serviços → Ecrã de consentimento OAuth**
2. Separador **Âmbitos** (ou **Data access**, conforme a versão)
3. **Adicionar ou remover âmbitos**
4. Procura e marca:

   ```
   https://www.googleapis.com/auth/calendar.events
   ```

5. Confirma que o de Drive continua lá:

   ```
   https://www.googleapis.com/auth/drive.file
   ```

6. **Actualizar** e depois **Guardar**

> **Porquê `calendar.events` e não `calendar`?** Porque chega. Este âmbito
> deixa criar e apagar eventos - que é tudo o que o sistema faz - e não dá
> acesso a definições da conta nem à lista de calendários. Menos permissões,
> menos estrago possível se alguma coisa correr mal.

Se a app estiver em **Testing**, confirma que a conta que vais usar está na
lista de **Utilizadores de teste**.

---

## Passo 3 · Ter à mão o Client ID e o Client Secret

São os mesmos que já usas para o Drive. Se precisares de os ver:

1. **APIs e serviços → Credenciais**
2. Abre o teu **ID de cliente OAuth 2.0** (tipo: aplicação Web)
3. Copia o **Client ID** e o **Client Secret**

Confirma que em **URIs de redirecionamento autorizados** está:

```
https://developers.google.com/oauthplayground
```

Se não estiver, acrescenta e guarda. Sem isto o passo 4 falha com
`redirect_uri_mismatch`.

---

## Passo 4 · Gerar o refresh token novo

1. Abre <https://developers.google.com/oauthplayground>
2. Carrega na **roda dentada** (canto superior direito)
3. Marca **Use your own OAuth credentials**
4. Cola o teu **Client ID** e **Client Secret**
5. Na coluna da esquerda, em vez de procurares na lista, cola os dois âmbitos
   na caixa **Input your own scopes**, separados por espaço:

   ```
   https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events
   ```

   > Tem mesmo de levar os **dois**. Se autorizares só o Calendar, o
   > arquivamento no Drive deixa de funcionar.

6. **Authorize APIs** → entra com a conta de recrutamento → **Permitir**
7. De volta ao Playground, carrega em **Exchange authorization code for
   tokens**
8. Copia o valor de **Refresh token** (começa por `1//`)

Se o campo **Refresh token** vier vazio, revoga o acesso da app em
<https://myaccount.google.com/permissions> e repete a partir do ponto 6 - o
Google só emite refresh token na primeira autorização.

---

## Passo 5 · Pôr o token na Vercel

1. Abre o projecto na Vercel → **Settings → Environment Variables**
2. Edita **`GOOGLE_OAUTH_REFRESH_TOKEN`** e cola o valor novo
3. Confirma que existem, com os mesmos valores de sempre:

   | Variável | O que é |
   |---|---|
   | `GOOGLE_OAUTH_CLIENT_ID` | do passo 3 |
   | `GOOGLE_OAUTH_CLIENT_SECRET` | do passo 3 |
   | `GOOGLE_OAUTH_REFRESH_TOKEN` | **o novo**, do passo 4 |

4. Opcional: `GOOGLE_CALENDAR_ID` se quiseres os eventos noutro calendário que
   não o principal da conta. Sem esta variável usa-se `primary`.
5. **Redeploy.** As variáveis de ambiente só entram num deploy novo.

---

## Passo 6 · Confirmar que ficou a funcionar

No painel: **Definições → Salas de videochamada → Testar a ligação**

O teste **cria mesmo uma sala** daqui a um ano e apaga-a logo a seguir. É de
propósito: listar calendários não provaria nada, porque dá para listar sem se
conseguir criar conferências - e essa diferença só apareceria com cinquenta
emails prontos a sair.

- **Verde** → está feito. Ao marcar entrevistas, deixa ligada a opção «criar
  uma sala do Meet por candidato».
- **Vermelho** → a mensagem diz o que falta. A tabela abaixo cobre o resto.

---

## Quando corre mal

| O que aparece | O que é | O que fazer |
|---|---|---|
| A autorização não inclui o Calendar | O token é o antigo, só com Drive | Repete o passo 4 com os **dois** âmbitos e actualiza a variável |
| O refresh token deixou de ser válido | Foi revogado, ou a app está em Testing há mais de 7 dias | Gera outro. Para deixar de caducar, publica a app no ecrã de consentimento |
| A Calendar API não está activada | Falta o passo 1 | Activa e espera 1 a 2 minutos |
| Contas de serviço não conseguem | Está a usar `GOOGLE_SERVICE_ACCOUNT_JSON` | Configura as três variáveis OAuth; elas ganham sempre à conta de serviço |
| `redirect_uri_mismatch` | Falta o URI do Playground | Passo 3, último ponto |
| O Google recusou por excesso de pedidos | Lote grande de uma vez | Espera um minuto. O sistema marca em lotes de 5 |

---

## Como funciona depois de ligado

Ao marcar entrevistas, com a opção de gerar salas ligada:

1. Para cada candidato, o sistema cria um evento no Calendar à hora dele, com
   um pedido de sala do Meet.
2. A criação da sala é **assíncrona** - o Google pode responder «ainda estou a
   preparar». O sistema espera e volta a perguntar, até quatro vezes.
3. Se mesmo assim não houver sala, **o candidato não é marcado** e o nome dele
   aparece nos problemas. É melhor não marcar do que marcar sem sala: um
   convite para uma videochamada que não existe é pior do que convite nenhum.
4. Com a sala criada, o link vai no email do candidato e fica no ecrã do
   recrutador, com um botão **Entrar na sala** e o endereço à vista para se
   poder copiar.

O convite automático do Google **não** é enviado (`sendUpdates: "none"`). Ia
em inglês, com o aspecto do Google e sem uma palavra sobre o processo, e o
candidato receberia dois emails a dizer coisas diferentes. O que sai é o email
do sistema, em português, com o link lá dentro.

---

## O que fazer se não quiseres ligar isto agora

O sistema funciona à mesma. Na marcação, desliga «criar uma sala por
candidato» e cola um link de Meet à mão - serve para o lote todo. É menos bom,
porque toda a gente partilha a mesma sala, mas funciona.
