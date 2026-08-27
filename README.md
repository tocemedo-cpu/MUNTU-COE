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
| Operações Muntu | `muntu_ops` | marta.miguel@muntucoe.ao | Muntu2026! |
| Fornecedor | `supplier` | carlos.mateus@kwanzaindustrial.ao | Muntu2026! |

## Personas e permissões

Do lado do cliente existem duas personas, aplicadas tanto no menu (frontend) como nas rotas de API (`middleware.ts` + `lib/authz.ts` — a autorização real vive no servidor, o frontend só esconde o que o utilizador não pode usar):

- **Requisitante** (`requester`) — limitado ao seu próprio workflow: consultar/criar os seus pedidos e escolher fornecedor no formulário. Sem acesso a aprovações, ordens de compra, recepções, facturas, excepções, pagamentos, relatórios, repositório ou administração — essas rotas devolvem `403` no servidor mesmo que alguém tente chamá-las directamente.
- **Administrador da empresa** (`company_admin`) — visão abrangente: tudo o que um requisitante vê, mais aprovações, toda a execução P2P e relatórios da sua empresa.
- **Operações Muntu** (`muntu_ops`) e **Fornecedor** (`supplier`) mantêm o acesso amplo que já tinham — não fazem parte desta reestruturação.

## Login: SSO por empresa ou e-mail/password

O login pede primeiro o e-mail, consulta `/api/auth/company-lookup` para saber a que empresa pertence o domínio, e só depois decide o fluxo:

- **Sem empresa registada, ou empresa com `auth_method = 'password'`** → mostra o campo de palavra-passe (fluxo actual).
- **Empresa com `auth_method = 'sso'`** → mostra um botão que redirecciona para `/api/auth/sso/start`, que inicia um fluxo OIDC (authorization code + PKCE) genérico contra `sso_issuer_url`/`sso_client_id`/`sso_client_secret` guardados na tabela `companies`.

**Isto só produz um login funcional quando a empresa fornece credenciais reais** de um fornecedor de identidade compatível com OpenID Connect Discovery (Microsoft Entra ID, Google Workspace, Okta, ...). Para activar SSO para uma empresa:

1. Registe uma aplicação OIDC no IdP da empresa, com `redirect_uri` = `https://<o-seu-domínio>/api/auth/sso/callback`.
2. Actualize a linha da empresa em `companies` (ainda sem UI de administração — via SQL directo por agora):
   ```sql
   update public.companies
   set auth_method = 'sso',
       sso_issuer_url = 'https://login.microsoftonline.com/<tenant-id>/v2.0',
       sso_client_id = '<client-id>',
       sso_client_secret = '<client-secret>'
   where domain = 'exemplo.com';
   ```
3. O primeiro login por SSO cria automaticamente o utilizador (nível `requester` por omissão) e liga-o a essa empresa.

## Rotas de API

| Rota | Métodos | Descrição |
| --- | --- | --- |
| `/api/auth/company-lookup` | `POST` | Resolve o domínio do e-mail para uma empresa e o seu método de login |
| `/api/auth/login` | `POST` | Autenticação por e-mail/palavra-passe — define cookie de sessão |
| `/api/auth/sso/start` | `GET` | Inicia o fluxo OIDC (authorization code + PKCE) da empresa |
| `/api/auth/sso/callback` | `GET` | Troca o código OIDC por tokens, verifica o ID token e cria a sessão |
| `/api/auth/me` | `GET` | Utilizador da sessão actual (restaura o login ao recarregar) |
| `/api/auth/logout` | `POST` | Termina a sessão |
| `/api/dashboard` | `GET` | Métricas agregadas do pipeline P2P |
| `/api/requests` | `GET`, `POST` | Listar/criar pedidos |
| `/api/requests/:id` | `GET`, `PATCH` | Detalhe e aprovar/rejeitar pedido |
| `/api/suppliers` | `GET`, `POST` | Listar/convidar fornecedores |
| `/api/purchase-orders` | `GET` | Ordens de compra |
| `/api/receipts` | `GET` | Recepções |
| `/api/receipts/:id` | `PATCH` | Confirmar recepção |
| `/api/invoices` | `GET` | Facturas e 3-way match |
| `/api/exceptions` | `GET` | Excepções |
| `/api/exceptions/:id` | `PATCH` | Resolver excepção |
| `/api/payments` | `GET` | Lotes de pagamento |
| `/api/payments/:id` | `PATCH` | Libertar pagamento |
| `/api/documents` | `GET`, `POST` | Repositório documental |

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

Para (re)semear os dados de demonstração via Drizzle (idempotente — só insere o que faltar):

```bash
npm run db:seed
```

---

© 2026 Muntu COE — Luanda, Angola.
