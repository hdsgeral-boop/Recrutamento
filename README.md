# CONSULVOLT - Plataforma Universal de Recrutamento Multi-Concurso

Plataforma empresarial de gestão de candidaturas, recrutamento e selecção técnica da **CONSULVOLT**. Desenvolvida para suportar múltiplos concursos, organizações e projetos simultâneos com isolamento total de dados, formulários dinâmicos 100% configuráveis e avaliação inteligente de candidatos.

Pronta para ser executada localmente em qualquer computador ou alojada em qualquer servidor Node.js, VPS, Docker ou Vercel.

---

## 🚀 Funcionalidades Principais

- **Arquitectura Multi-Concurso e Multi-Organização:**
  - Isolamento estrito de candidaturas, entrevistas e pontuações por concurso e organização.
  - Cada gestor ou equipa acede e opera apenas nos concursos a que tem autorização.
  - Suporte a subdomínios dedicados ou selecção via parâmetro/contexto (`?concurso=slug` ou domínio próprio).
- **Formulários Dinâmicos e 100% Configuráveis:**
  - Definição em sistema de campos adicionais por vaga (número, texto, área de texto, selecção, booleano, data, ficheiros).
  - Títulos de vaga, requisitos e prazos configurados pelo gestor sem alteração de código.
- **Triagem e Ranking Universal:**
  - Rúbrica universal de 100 pontos ponderando formação académica, experiência comprovada, literacia digital, cartas de condução e completude documental.
  - Detecção e alertas automáticos de discrepâncias entre declarações e comprovativos.
- **Módulo de Entrevistas Integrado:**
  - Gestão de agendas, salas e marcação de entrevistas.
  - Integração com Google Meet / Google Calendar.
  - Relógio de entrevista e fichas de avaliação padronizadas.
- **Painel Administrativo Completo:**
  - Dashboard analítico com funil de recrutamento em tempo real.
  - Exportação de dados filtrados para Excel (`.xlsx`).
  - Contacto directo por WhatsApp e registo de histórico de comunicações.
  - Diagnóstico integrado de conectividade com serviços externos.

---

## 📁 Estrutura do Projecto

```
recrutamento-consulvolt/
├── src/
│   ├── app/                      # Rotas Next.js (App Router)
│   │   ├── (publico)/            # Formulários públicos de candidatura
│   │   │   ├── app/              # Formulário dinâmico (/app?concurso=...)
│   │   │   └── sucesso/          # Confirmação com código de candidatura
│   │   ├── admin/                # Painel de gestão administrativa
│   │   │   ├── (painel)/         # Dashboard, Candidaturas, Ranking, Concursos
│   │   │   ├── entrevistas/      # Gestão de slots, salas e avaliações
│   │   │   └── definicoes/       # Configuração dinâmica de parâmetros
│   │   └── api/                  # Endpoints REST (diagnóstico, exportação, webhook)
│   ├── components/               # Componentes UI (React, Tailwind CSS, Lucide)
│   └── lib/                      # Lógica de negócio, validações, ranking e Supabase
├── supabase/
│   └── migrations/               # Scripts de migração SQL e esquemas
│       └── 20261002_consulvolt_fresh_install.sql # Instalação limpa inicial
├── public/                       # Activos estáticos (logotipos, ícones)
└── .env.example                  # Modelo de variáveis de ambiente
```

---

## 🛠️ Como Executar Localmente

### 1. Pré-requisitos
- **Node.js**: versão 18.18.0 ou superior (recomendado Node 20 LTS ou 22).
- **npm** (ou yarn/pnpm).

### 2. Instalação de Dependências
```bash
git clone git@github.com:hdsgeral-boop/Recrutamento.git
cd Recrutamento
npm install
```

### 3. Configurar Variáveis de Ambiente
Copie o ficheiro `.env.example` para `.env.local`:
```bash
cp .env.example .env.local
```
Preencha as variáveis essenciais:
- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Credenciais do projecto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: Chave de serviço para operações administrativas.
- `ADMIN_USER` e `ADMIN_PASS`: Credenciais padrão para acesso inicial ao painel `/admin/login`.
- `ADMIN_SESSION_SECRET`: Chave secreta aleatória (ex.: gerada com `openssl rand -base64 32`).

### 4. Inicializar a Base de Dados
No painel do Supabase (SQL Editor), execute o script de instalação limpa:
`supabase/migrations/20261002_consulvolt_fresh_install.sql`

Isto cria toda a estrutura de tabelas, índices, políticas de segurança RLS e cria a primeira organização e concurso inicial configurável.

### 5. Iniciar o Servidor de Desenvolvimento
```bash
npm run dev
```
Aceda a:
- **Formulário de Candidatura:** `http://localhost:3000/app`
- **Painel de Administração:** `http://localhost:3000/admin`

---

## 🧪 Testes e Validação de Código

Para executar a suite de testes unitários:
```bash
npm test
```

Para verificar tipos TypeScript:
```bash
npx tsc --noEmit
```

Para compilar para produção:
```bash
npm run build
```

---

## 🌐 Instalação e Hospedagem em Produção

O projecto é totalmente standard e pode ser instalado em:
- **Vercel:** Conecte o repositório GitHub e configure as variáveis de ambiente em *Settings > Environment Variables*.
- **VPS / Servidor Linux (Ubuntu/Debian):**
  ```bash
  npm install
  npm run build
  npm start
  ```
  Pode utilizar o `pm2` ou um serviço `systemd` para manter o processo em execução contínua atrás de um proxy reverso NGINX.
- **Docker:** O Next.js suporta containerização padrão com Node.js alpine.

---

## 🔒 Segurança

- Todas as tabelas críticas possuem **Row Level Security (RLS)** habilitado.
- Os uploads de documentos são assinados e armazenados em buckets privados.
- Operações administrativas são autenticadas via sessão segura assinada por HMAC/JWT.
