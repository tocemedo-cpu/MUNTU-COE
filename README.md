# Muntu COE — Portal P2P

Plataforma one-stop-shop P2P (Procure-to-Pay) do **Muntu Centre of Excellence**, para Angola, PALOP e África Subsaariana.

Aplicação full-stack em **Next.js 16** (App Router), com base de dados **Postgres (Supabase)** via **Drizzle ORM**.

## Estrutura

- `app/page.tsx` — frontend do portal (site institucional, login e workspace operacional).
- `app/api/**` — rotas de API (Next.js Route Handlers) que servem os dados ao frontend.
- `db/schema.ts` — modelo de dados (Drizzle, dialecto `postgresql`).
- `db/index.ts` — ligação à base de dados via `DATABASE_URL`.
- `db/seed-data.ts` — dados de demonstração (inseridos via `npm run db:seed`).
- `supabase/schema.sql` — SQL pronto a colar no SQL Editor do Supabase (tabelas, índices, RLS e dados de demonstração).

## Configurar a base de dados (Supabase)

1. Crie um projecto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor** e cole o conteúdo de `supabase/schema.sql`. Execute — cria as tabelas, os índices, activa RLS com políticas de demonstração e semeia os dados iniciais.
3. Em **Project Settings → Database → Connection string**, abra o separador **Transaction** (pooler/Supavisor, porta `6543`) e copie essa string — **não** a ligação directa (`db.<ref>.supabase.co`). A ligação directa só tem endereço IPv6 e o Render não tem saída IPv6, o que causa `ENETUNREACH` no arranque.
4. Copie `.env.example` para `.env.local` e cole a connection string em `DATABASE_URL`.

## Executar localmente

Requisitos: Node.js ≥ 20.

**Defina `SESSION_SECRET` em `.env.local` antes de arrancar** — sem isto, o login parece funcionar mas a sessão não sobrevive ao pedido seguinte (`npm run dev` usa Turbopack, que pode isolar cada rota de API no seu próprio módulo; o segredo aleatório de fallback deixa de ser garantidamente igual entre rotas — ver comentário em `lib/session.ts`). Gere um valor com `openssl rand -hex 32`.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

### Perfis de demonstração (login)

| Perfil | Nível de acesso | E-mail | Palavra-passe |
| --- | --- | --- | --- |
| Requisitante | `requester` | ana.manuel@operadora.ao | Muntu2026! |
| Administrador da empresa | `company_admin` | joao.sebastiao@operadora.ao | Muntu2026! |
| COE Manager | `coe_manager` | marta.miguel@muntucoe.ao | Muntu2026! |
| Analista (Buyer/AP) | `analyst` | sofia.neto@muntucoe.ao | Muntu2026! |
| System Admin | `system_admin` | rui.domingos@muntucoe.ao | Muntu2026! |
| Fornecedor | `supplier` | carlos.mateus@kwanzaindustrial.ao | Muntu2026! |

As palavras-passe são guardadas como hash bcrypt (`lib/password.ts`, `bcryptjs`) — nunca em texto simples. Se já tinha uma instalação anterior a esta alteração, volte a colar `supabase/schema.sql` no SQL Editor: a instrução de migração no fim do bloco de utilizadores reencripta em bcrypt qualquer palavra-passe ainda em texto simples (idempotente, não mexe em hashes já bcrypt).

## Personas e permissões

Seis níveis de acesso, aplicados tanto no menu (frontend) como nas rotas de API (`middleware.ts` + `lib/authz.ts` — a autorização real vive no servidor, o frontend só esconde o que o utilizador não pode usar).

Lado do cliente:

- **Requisitante** (`requester`) — limitado ao seu próprio workflow: consultar/criar os seus pedidos e escolher fornecedor no formulário. Sem acesso a aprovações, execução P2P, relatórios ou administração — essas rotas devolvem `403` no servidor mesmo que alguém tente chamá-las directamente.
- **Administrador da empresa** (`company_admin`) — visão abrangente da sua empresa: tudo o que um requisitante vê, mais aprovações, toda a execução P2P e relatórios. Pedidos, POs, facturas, recepções, excepções e lotes de pagamento são todos filtrados por `companyId` — um `company_admin` nunca vê dados de outra empresa.

Lado Muntu:

- **Analista — Buyer/AP** (`analyst`) — reporta ao COE Manager, restrito à **execução** do workflow (fornecedores, ordens de compra, recepções, facturas, excepções, pagamentos, repositório). Sem dashboard, sem relatórios, sem administração.
- **COE Manager** (`coe_manager`) — visão abrangente: dashboard, relatórios, aprovações e toda a execução P2P entre empresas clientes.
- **System Admin** (`system_admin`) — responsável máximo da plataforma. Único nível com acesso a `/api/admin/**` e à página **Utilizadores**, onde concede/retira o nível de acesso de qualquer utilizador. Vê tudo o que o COE Manager vê.
- **Fornecedor** (`supplier`) — vê e edita só o seu próprio perfil (Supplier Passport) e só as suas próprias POs, recepções e facturas. Cada utilizador `supplier` está ligado a um `suppliers.id` concreto (`users.supplier_id`); sem essa ligação, o âmbito fica vazio — nunca "vê tudo" por omissão. O System Admin faz a ligação em **Utilizadores**. Passport, risco e estado continuam avaliados pela Muntu (não editáveis pelo próprio fornecedor); categoria e conteúdo local são auto-declaráveis via `PATCH /api/suppliers/:id`. `PATCH /api/receipts/:id` (confirmar recepção) também está limitado à recepção do próprio fornecedor.

### Gestão de permissões (System Admin)

A página **Utilizadores** (`/api/admin/users`) lista todos os utilizadores da plataforma e permite mudar o nível de acesso de qualquer um por um simples select — chama `PATCH /api/admin/users/:id`. Estas duas rotas só respondem a `system_admin`; qualquer outro nível recebe `403` do `middleware.ts` antes de chegar à rota.

### Contas dos donos da operação (COE Manager / System Admin) e acesso reservado

As contas reais de quem gere a operação (não dados de demonstração) são criadas por um script dedicado, não pelo seed:

```bash
DATABASE_URL="<connection string real>" npx tsx scripts/create-owner-admins.ts
```

Cria `tocemedo@gmail.com` (`coe_manager`) e `zelyvaldog@gmail.com` (`system_admin`) — ou, se já existirem, só actualiza o papel/dados, **nunca** a password (correr o script outra vez nunca desfaz uma troca de password já feita). Numa criação nova, imprime uma password inicial aleatória uma única vez no terminal — guarde-a; a partir daí muda-se como qualquer conta, por "Recuperar acesso" no ecrã de login.

Estas duas contas entram por um ecrã diferente do login normal dos clientes/fornecedores — **acesso reservado**, com estética escura e um único passo (e-mail + password, sem o lookup de empresa/SSO). Não há nenhum botão visível para lá chegar: no site público, clicar 4 vezes seguidas (menos de 800ms entre cliques) no símbolo Muntu do cabeçalho abre-o. A URL nunca fica marcada com esse ecrã (sem hash tipo `#admin-login`) precisamente para não ficar óbvio nem no histórico do browser — quem não conhece o gesto não encontra o ecrã por engano.

## Facturação de actividade (cobrança ao cliente)

Modelo de preços do Estudo de Viabilidade §32.4/53.1: **retainer mensal + preço por PO (por tier) + preço por factura (por tier)**, com acesso básico gratuito e serviços avançados (onboarding, integração, analytics, formação) fora desta facturação recorrente.

- **Tiers de PO** (`automatico` | `standard` | `complexo`) — classificados a partir do "Tipo de transacção" do wizard (`lib/billing-tiers.ts`): "Compra urgente" → complexo, "PO catalogado" → automático, resto → standard. Aprovar um pedido gera agora automaticamente a PO ligada (`app/api/requests/[id]/route.ts`), já com o tier certo.
- **Tiers de factura** (`limpa` | `assistida` | `excecao`) — classificados a partir de `match`/`status`: excepção → excecao, "3-way match" → limpa, resto → assistida.
- **Preços por unidade** vivem em `billing_rates` (seeded com o ponto médio de cada intervalo do estudo). Editáveis na própria página **Facturação** (painel "Tarifas por unidade", `system_admin`) via `PATCH /api/admin/billing-rates/:key`, ou por SQL directo se preferir.
- **Retainer** vive em `companies.retainer_amount` (0 por omissão — o estudo não dá um valor indicativo, é "por cliente e escopo"). Editável na página **Facturação** (painel "Retainer por empresa") via `PATCH /api/admin/companies/:id`, ou por SQL directo: `update companies set retainer_amount = <valor AOA> where domain = '...'`.

Fluxo: `POST /api/admin/billing` (system_admin) gera uma `client_invoice` para uma empresa/período/âmbito (parcial ou total), somando retainer + POs + facturas desse período. Fica em `pendente_aprovacao`. O System Admin aprova ou rejeita (`PATCH /api/admin/billing/:id`); uma factura aprovada pode depois ser marcada como `enviada_contabilidade` — não há integração real com um sistema de contabilidade, é só um estado que sinaliza a entrega (a contabilidade não faz parte desta plataforma).

**Geração mensal automática:** `POST /api/admin/billing/generate-monthly` gera a factura do mês anterior para todas as empresas. Não corre sozinha — precisa de ser chamada por um agendador externo (Render Cron Job, GitHub Actions, cron-job.org, ...) com o header `x-cron-secret: <CRON_SECRET>`. Defina `CRON_SECRET` no Render; sem ele, a rota recusa sempre (nunca fica aberta por omissão).

## Login: SSO por empresa ou e-mail/password

O login pede primeiro o e-mail, consulta `/api/auth/company-lookup` para saber a que empresa pertence o domínio, e só depois decide o fluxo:

- **Sem empresa registada, ou empresa com `auth_method = 'password'`** → mostra o campo de palavra-passe (fluxo actual).
- **Empresa com `auth_method = 'sso'`** → mostra um botão que redirecciona para `/api/auth/sso/start`, que inicia um fluxo OIDC (authorization code + PKCE) genérico contra `sso_issuer_url`/`sso_client_id`/`sso_client_secret` guardados na tabela `companies`.

**Isto só produz um login funcional quando a empresa fornece credenciais reais** de um fornecedor de identidade compatível com OpenID Connect Discovery (Microsoft Entra ID, Google Workspace, Okta, ...). Para activar SSO para uma empresa:

1. Registe uma aplicação OIDC no IdP da empresa, com `redirect_uri` = `https://<o-seu-domínio>/api/auth/sso/callback`.
2. Preencha o método de login, issuer URL, client ID e client secret na página **Administração** (painel "SSO por empresa", só `system_admin`) — chama `PATCH /api/admin/companies/:id`. O client secret nunca é devolvido pela API depois de guardado (só um indicador "definido"/"não definido"); deixar o campo em branco ao editar mantém o valor actual. SQL directo continua a funcionar como alternativa:
   ```sql
   update public.companies
   set auth_method = 'sso',
       sso_issuer_url = 'https://login.microsoftonline.com/<tenant-id>/v2.0',
       sso_client_id = '<client-id>',
       sso_client_secret = '<client-secret>'
   where domain = 'exemplo.com';
   ```
3. O primeiro login por SSO cria automaticamente o utilizador (nível `requester` por omissão) e liga-o a essa empresa.

### Recuperar acesso

O botão "Recuperar acesso" (só aparece para contas de e-mail/password — contas SSO não têm password local para repor) chama `POST /api/auth/password-reset/request` com o e-mail. A resposta é sempre `{ ok: true }`, exista ou não uma conta com esse e-mail — nunca revela quais contas existem. Se existir e tiver password local, é gerado um token assinado (30 minutos, mesmo mecanismo HMAC das sessões, com `purpose: "password_reset"` para nunca ser confundido com um cookie de sessão) e enviado por e-mail via [Resend](https://resend.com) com o link `/?reset_token=<token>#login`. Abrir esse link mostra o formulário de nova password; submeter chama `POST /api/auth/password-reset/confirm`.

**Sem `RESEND_API_KEY` definida**, o pedido continua a funcionar exactamente da mesma forma (nunca falha, nunca revela nada) — só que o link fica registado nos logs do servidor (`console.warn`) em vez de ser enviado por e-mail, tal como o SSO só fica totalmente funcional com credenciais reais do IdP.

Para activar o envio real: crie uma conta em [resend.com](https://resend.com), gere uma API key (Dashboard → API Keys) e defina `RESEND_API_KEY`.

- **Sem domínio verificado (para testar já):** deixe `RESEND_FROM_EMAIL` por definir — usa o remetente de teste partilhado do Resend (`onboarding@resend.dev`), que só entrega ao e-mail da própria conta Resend, mas não exige nenhuma configuração de DNS.
- **Com domínio próprio (para enviar a destinatários reais):** verifique o domínio em Resend → Domains (adicione os registos DNS pedidos) e defina `RESEND_FROM_EMAIL="Muntu COE <no-reply@o-seu-dominio>"`.

**Limitação conhecida:** o token é reutilizável dentro da janela de 30 minutos (sem registo de "já usado" numa tabela) — mais simples de implementar e testar, ao custo de uma janela pequena onde o mesmo link, se interceptado, podia repor a password mais do que uma vez.

## Suporte (caixa de entrada de pedidos)

Qualquer utilizador autenticado (independentemente do `accessLevel`) pode abrir um pedido de suporte em **Suporte** na barra lateral — assunto, categoria e mensagem inicial; a prioridade por omissão é `normal`. Cada pedido recebe um ID `SUP-<ano>-####` (gerado aleatoriamente com nova tentativa em caso de colisão, mesmo padrão dos IDs de PO) e um prazo de SLA calculado a partir da prioridade (`lib/support.ts`):

| Prioridade | Janela de SLA |
| --- | --- |
| `urgente` | 4 horas |
| `alta` | 24 horas |
| `normal` | 72 horas |
| `baixa` | 120 horas |

Um utilizador normal só vê e responde aos seus próprios pedidos (403 para os de outra pessoa). O `system_admin` vê a caixa de entrada completa — com contagem de abertos e de pedidos com SLA vencido — pode responder a qualquer pedido (uma resposta do admin move automaticamente `aberto` → `em_curso`) e é o único que pode mudar estado, prioridade, categoria ou responsável. Fechar um pedido como `resolvido`/`fechado` regista `resolvedAt`; reabri-lo limpa esse campo. Tal como `users`/`billing_rates`/`document_files`, `support_tickets` e `support_messages` não têm política de `select` — ilegíveis pela API pública/anon key, só por rotas de servidor.

## Rotas de API

| Rota | Métodos | Descrição |
| --- | --- | --- |
| `/api/auth/company-lookup` | `POST` | Resolve o domínio do e-mail para uma empresa e o seu método de login |
| `/api/auth/login` | `POST` | Autenticação por e-mail/palavra-passe — define cookie de sessão |
| `/api/auth/sso/start` | `GET` | Inicia o fluxo OIDC (authorization code + PKCE) da empresa |
| `/api/auth/sso/callback` | `GET` | Troca o código OIDC por tokens, verifica o ID token e cria a sessão |
| `/api/auth/me` | `GET` | Utilizador da sessão actual (restaura o login ao recarregar) |
| `/api/auth/logout` | `POST` | Termina a sessão |
| `/api/auth/password-reset/request` | `POST` | Pede um link de recuperação de acesso (resposta genérica, sem enumeração) |
| `/api/auth/password-reset/confirm` | `POST` | Define nova palavra-passe a partir do token do link |
| `/api/dashboard` | `GET` | Métricas agregadas do pipeline P2P |
| `/api/requests` | `GET`, `POST` | Listar/criar pedidos |
| `/api/requests/:id` | `GET`, `PATCH` | Detalhe e aprovar/rejeitar pedido |
| `/api/suppliers` | `GET`, `POST` | Listar/convidar fornecedores — um `supplier` só vê o seu próprio |
| `/api/suppliers/:id` | `PATCH` | Editar fornecedor — interno: tudo; `supplier`: só o seu, só categoria/conteúdo local |
| `/api/purchase-orders` | `GET` | Ordens de compra |
| `/api/receipts` | `GET` | Recepções |
| `/api/receipts/:id` | `PATCH` | Confirmar recepção |
| `/api/invoices` | `GET` | Facturas e 3-way match |
| `/api/exceptions` | `GET` | Excepções |
| `/api/exceptions/:id` | `PATCH` | Resolver excepção |
| `/api/payments` | `GET` | Lotes de pagamento |
| `/api/payments/:id` | `PATCH` | Libertar pagamento |
| `/api/documents` | `GET`, `POST` | Repositório documental — `POST` é upload real (`multipart/form-data`, campo `file`, até 15 MB) |
| `/api/documents/:id/download` | `GET` | Descarrega os bytes reais do ficheiro carregado |
| `/api/admin/users` | `GET` | Lista todos os utilizadores (só `system_admin`) |
| `/api/admin/users/:id` | `PATCH` | Muda o nível de acesso/empresa de um utilizador (só `system_admin`) |
| `/api/admin/companies` | `GET` | Lista as empresas clientes (só `system_admin`) |
| `/api/admin/companies/:id` | `PATCH` | Actualiza retainer e/ou configuração de SSO de uma empresa — só os campos enviados mudam (só `system_admin`) |
| `/api/admin/billing` | `GET`, `POST` | Lista/gera facturas de cobrança a clientes (só `system_admin`) |
| `/api/admin/billing/:id` | `GET`, `PATCH` | Detalhe e aprovar/rejeitar/enviar à contabilidade (só `system_admin`) |
| `/api/admin/billing/generate-monthly` | `POST` | Geração mensal automática — autenticada por `CRON_SECRET`, não por sessão |
| `/api/admin/billing-rates` | `GET` | Lista as tarifas de facturação (só `system_admin`) |
| `/api/admin/billing-rates/:key` | `PATCH` | Actualiza o valor de uma tarifa (só `system_admin`) |
| `/api/support` | `GET`, `POST` | Pedidos de suporte — `GET` lista os próprios (todos para `system_admin`); `POST` abre um pedido com mensagem inicial |
| `/api/support/:id` | `GET`, `PATCH` | Detalhe + fio de mensagens (dono ou `system_admin`); `PATCH` muda estado/prioridade/categoria/responsável (só `system_admin`) |
| `/api/support/:id/messages` | `POST` | Responde num pedido (dono ou `system_admin`) — uma resposta do admin move automaticamente `aberto` → `em_curso` |

Todas as rotas excepto `/api/auth/login` e `/api/auth/logout` exigem sessão válida — `middleware.ts` verifica o cookie `muntu_session` (assinado por HMAC) antes de qualquer rota executar e devolve `401` sem sessão.

## Deploy no Render

Este repositório inclui um `render.yaml` (Render Blueprint).

1. No dashboard do Render: **New → Blueprint**, aponte para este repositório GitHub (`tocemedo-cpu/MUNTU-COE`).
2. O Render lê o `render.yaml` e propõe um Web Service Node com:
   - `buildCommand`: `npm ci && npm run build`
   - `startCommand`: `npm run start` (liga-se à porta `$PORT` fornecida pelo Render)
3. **Antes de confirmar o deploy**, preencha a variável de ambiente `DATABASE_URL` (connection string do Supabase, a mesma usada localmente). É necessária **no build**, não só em runtime — as rotas de API são analisadas durante `next build`, por isso um build sem `DATABASE_URL` falha logo com um erro claro.
4. Deploy. Não é preciso disco persistente — os dados vivem no Supabase, não no Render.

Alternativa sem Blueprint: criar manualmente um **Web Service** em Render → ligar o repositório → *Environment*: Node → *Build Command*: `npm ci && npm run build` → *Start Command*: `npm run start` → adicionar `DATABASE_URL` nas *Environment Variables*.

## Base de dados

O schema fica definido em dois sítios sincronizados:

- `supabase/schema.sql` — SQL directo, a fonte usada para provisionar o Supabase.
- `db/schema.ts` — o mesmo modelo em Drizzle, usado pela aplicação e por `drizzle-kit`.

Para gerar migrações versionadas a partir do schema Drizzle:

```bash
npm run db:generate
```

### Ficheiros carregados (Repositório)

Os bytes reais de cada documento vivem em `document_files` (coluna `bytea`), separada de `documents` (só metadados) para que listar/pesquisar documentos nunca puxe ficheiros inteiros para memória — só `GET /api/documents/:id/download` toca essa tabela. Limite de 15 MB por ficheiro (`lib/uploads.ts`). Tal como `users`/`billing_rates`, `document_files` não tem política de `select` — ilegível pela API pública/anon key, só por rotas de servidor. Os 4 documentos de demonstração semeados (`db/seed-data.ts`) são só metadados, sem ficheiro real por trás — o download devolve `404` para eles, o que é esperado.

Para (re)semear os dados de demonstração via Drizzle (idempotente — só insere o que faltar):

```bash
npm run db:seed
```

## Testes

Dois níveis, separados por design:

- **`npm test`** — testes unitários (`tests/unit/`), sem qualquer base de dados: hashing/verificação de password, classificação de tiers de PO/factura, tokens de sessão (assinatura, adulteração, expiração) e os schemas zod. Correm em menos de um segundo, seguros de correr sempre, inclusive sem Postgres instalado.
- **`npm run test:integration`** — testes de integração (`tests/integration/`) contra um Postgres **local** real: login (`POST /api/auth/login`), aprovação de pedido a gerar a PO ligada com o tier certo, geração de factura de cliente (retainer + tiers), o escopo por empresa de `receipts`/`exceptions`/`payments`, a UI de admin de tarifas/retainer/SSO (`/api/admin/billing-rates`, `/api/admin/companies/:id` — incluindo que o client secret nunca é devolvido e sobrevive a um PATCH que não o envie), o upload/download real de documentos (round trip completo dos bytes via `bytea`), e a recuperação de acesso (pedido sem enumeração de utilizadores, confirmação com token válido/expirado/mal-tipado, e que a nova password passa a funcionar no login). Chamam os handlers de rota directamente (sem servidor Next.js a decorrer) com sessões simuladas via os mesmos headers `x-muntu-*` que o `middleware.ts` injecta — por desenho, não passam pelo middleware em si.

Para correr os testes de integração é preciso um Postgres local (nunca aponte isto para o Supabase de produção):

```bash
sudo apt-get install -y postgresql postgresql-contrib   # ou o equivalente no seu SO
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE muntu_test OWNER postgres;"

DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/muntu_test?sslmode=disable" npx drizzle-kit push --force

npm run test:integration
```

O `?sslmode=disable` é a única forma de desligar o SSL na ligação (`db/index.ts`) — sem esse parâmetro explícito, a app exige sempre SSL, tal como em produção. Os testes recusam-se a correr (erro explícito) se `DATABASE_URL` não tiver `sslmode=disable`, precisamente para nunca correr por engano contra a base de dados real.

`.github/workflows/ci.yml` corre tudo isto automaticamente em cada push/PR para `main`: lint + typecheck + build + testes unitários num job, testes de integração contra um serviço Postgres do próprio runner noutro.

---

© 2026 Muntu COE — Luanda, Angola.
