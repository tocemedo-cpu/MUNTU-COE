-- =========================================================
-- Muntu COE — Schema Supabase (Postgres)
-- Cole este ficheiro completo no SQL Editor do Supabase e execute.
-- =========================================================

-- -----------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------

-- Empresa cliente. O método de login (SSO federado vs. e-mail/password) é
-- decidido por empresa a partir do domínio do e-mail. As colunas sso_* só
-- produzem um login funcional quando a empresa fornece as credenciais
-- reais do seu fornecedor de identidade (Entra ID, Google Workspace,
-- Okta, ...) — ver README para o fluxo OIDC.
create table if not exists public.companies (
  id bigint generated always as identity primary key,
  name text not null,
  domain text not null unique,
  auth_method text not null default 'password', -- 'password' | 'sso'
  sso_issuer_url text,
  sso_client_id text,
  sso_client_secret text,
  created_at timestamptz not null default now()
);

-- Retainer mensal negociado (AOA). Sem valor definido, a facturação de
-- actividade usa 0 para esta linha — Estudo de Viabilidade §32.4/53.1.
alter table public.companies add column if not exists retainer_amount bigint not null default 0;

create table if not exists public.users (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null unique,
  password text, -- nula para utilizadores federados por SSO
  role text not null,
  initials text not null,
  tenant text not null default 'Operadora Atlântico, SA'
);

-- Colunas adicionadas depois do lançamento inicial — seguras de repetir
-- tanto numa instalação nova como a actualizar uma já existente.
alter table public.users add column if not exists company_id bigint references public.companies (id);
alter table public.users add column if not exists access_level text not null default 'requester'; -- system_admin | coe_manager | analyst | supplier | company_admin | requester
alter table public.users add column if not exists sso_subject text;
alter table public.users alter column password drop not null;

create table if not exists public.requests (
  id text primary key,
  subject text not null,
  tower text not null,
  value bigint not null default 0,
  status text not null,
  priority text not null,
  owner text not null,
  sla text not null,
  stage integer not null default 0,
  submitted text not null,
  supplier text not null,
  cost_center text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.requests add column if not exists owner_user_id bigint references public.users (id);
alter table public.requests add column if not exists company_id bigint references public.companies (id);
-- Tipo de transacção do wizard — determina o tier de facturação da PO
-- gerada na aprovação (ver lib/billing.ts).
alter table public.requests add column if not exists type text not null default 'PO standard';
-- Prazo real de decisão (calculado a partir da prioridade na criação) e
-- momento em que foi de facto aprovado/rejeitado — única fonte real de
-- "SLA no prazo %" e "ciclo médio", em vez dos números fixos no código
-- que existiam no frontend antes (ver lib/requests-sla.ts).
alter table public.requests add column if not exists sla_due_at timestamptz;
alter table public.requests add column if not exists decided_at timestamptz;

create table if not exists public.suppliers (
  id bigint generated always as identity primary key,
  name text not null unique,
  category text not null,
  passport integer not null default 0,
  risk text not null default 'Médio',
  local text not null default '0%',
  status text not null default 'Documentos',
  created_at timestamptz not null default now()
);

-- Só para access_level = 'supplier': qual fornecedor este utilizador
-- representa. Sem isto ligado, o utilizador não vê POs/recepções/
-- facturas nenhumas (âmbito vazio por omissão — nunca "vê tudo").
alter table public.users add column if not exists supplier_id bigint references public.suppliers (id);

create table if not exists public.purchase_orders (
  id text primary key,
  supplier text not null,
  description text not null,
  value bigint not null default 0,
  status text not null,
  next_action text not null default ''
);

alter table public.purchase_orders add column if not exists request_id text references public.requests (id);
alter table public.purchase_orders add column if not exists company_id bigint references public.companies (id);
alter table public.purchase_orders add column if not exists supplier_id bigint references public.suppliers (id);
alter table public.purchase_orders add column if not exists tier text not null default 'standard'; -- automatico | standard | complexo
alter table public.purchase_orders add column if not exists created_at timestamptz not null default now();

-- Tender/Sourcing (RFQ) — pedido de cotação a vários fornecedores
-- convidados, com adjudicação a uma proposta que gera a PO. Primeira fase
-- real do pilar Procurement.
create table if not exists public.tenders (
  id text primary key, -- "RFQ-2026-####"
  title text not null,
  description text not null default '',
  company_id bigint not null references public.companies (id),
  request_id text references public.requests (id),
  created_by_user_id bigint not null references public.users (id),
  deadline timestamptz not null,
  status text not null default 'aberto', -- aberto | adjudicado | cancelado
  awarded_bid_id bigint,
  awarded_po_id text references public.purchase_orders (id),
  created_at timestamptz not null default now()
);

create table if not exists public.tender_invites (
  id bigint generated always as identity primary key,
  tender_id text not null references public.tenders (id),
  supplier_id bigint not null references public.suppliers (id),
  unique (tender_id, supplier_id)
);

create table if not exists public.bids (
  id bigint generated always as identity primary key,
  tender_id text not null references public.tenders (id),
  supplier_id bigint not null references public.suppliers (id),
  value bigint not null,
  notes text not null default '',
  status text not null default 'submetida', -- submetida | vencedora | rejeitada
  submitted_at timestamptz not null default now(),
  unique (tender_id, supplier_id)
);

-- Contrato/Call-off — acordo com validade e tecto de valor, distinto de
-- uma PO pontual. `status` só regista o que uma pessoa decidiu (terminar
-- antecipadamente); "a expirar"/"expirado" nunca são gravados — são
-- sempre calculados a partir de end_date, para nunca ficarem
-- desactualizados (mesmo princípio da linha temporal da PO: derivado,
-- não fabricado).
create table if not exists public.contracts (
  id text primary key, -- "CTR-2026-####"
  title text not null,
  supplier text not null,
  supplier_id bigint references public.suppliers (id),
  company_id bigint not null references public.companies (id),
  request_id text references public.requests (id),
  value bigint not null default 0,
  start_date timestamptz not null,
  end_date timestamptz not null,
  notes text not null default '',
  status text not null default 'activo', -- activo | terminado
  created_by_user_id bigint not null references public.users (id),
  created_at timestamptz not null default now()
);

-- Catálogo de fornecedores — item com preço pré-negociado, para alimentar
-- o tipo de transacção "PO catalogado" (tier automático) com dados reais.
-- Curado pela Muntu (analyst/coe_manager/system_admin), navegável por
-- qualquer pessoa que crie pedidos.
create table if not exists public.catalog_items (
  id text primary key, -- "CAT-2026-####"
  name text not null,
  description text not null default '',
  category text not null default '',
  supplier text not null,
  supplier_id bigint not null references public.suppliers (id),
  unit_price bigint not null default 0,
  unit text not null default 'un',
  active boolean not null default true,
  created_by_user_id bigint not null references public.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id bigint generated always as identity primary key,
  po text not null,
  description text not null,
  supplier text not null,
  value bigint not null default 0,
  progress integer not null default 0,
  status text not null default 'Em curso'
);

alter table public.receipts add column if not exists supplier_id bigint references public.suppliers (id);
-- Sem esta coluna, `company_admin` via a API via um filtro por empresa
-- inexistente e recebia recepções de todas as empresas — ver app/api/receipts.
alter table public.receipts add column if not exists company_id bigint references public.companies (id);

create table if not exists public.invoices (
  id text primary key,
  supplier text not null,
  po text not null,
  value bigint not null default 0,
  match text not null,
  status text not null,
  due text not null
);

alter table public.invoices add column if not exists supplier_id bigint references public.suppliers (id);

alter table public.invoices add column if not exists company_id bigint references public.companies (id);
alter table public.invoices add column if not exists tier text not null default 'assistida'; -- limpa | assistida | excecao
alter table public.invoices add column if not exists created_at timestamptz not null default now();

create table if not exists public.exceptions (
  id text primary key,
  title text not null,
  ref text not null,
  owner text not null,
  age text not null,
  impact text not null,
  resolved boolean not null default false
);

-- Mesma razão que em receipts: sem isto, `company_admin` recebia excepções
-- de todas as empresas via a API.
alter table public.exceptions add column if not exists company_id bigint references public.companies (id);

-- `age` era um texto fixo ("2h 14m") gravado uma vez e nunca mais
-- actualizado — substituído por `created_at` real, com a idade calculada
-- no frontend a cada render (formatElapsedPt em app/page.tsx). `cause`
-- alimenta a agregação real "Excepções por causa" em Relatórios, em vez
-- da lista de percentagens fixa no código que existia antes.
alter table public.exceptions add column if not exists created_at timestamptz not null default now();
alter table public.exceptions add column if not exists cause text not null default 'Outros';
alter table public.exceptions drop column if exists age;

create table if not exists public.payment_batches (
  id text primary key,
  date text not null,
  count integer not null default 0,
  value bigint not null default 0,
  status text not null default 'Pronto',
  released boolean not null default false
);

-- Mesma razão que em receipts/exceptions: sem isto, company_admin recebia
-- lotes de pagamento de todas as empresas via a API.
alter table public.payment_batches add column if not exists company_id bigint references public.companies (id);

create table if not exists public.documents (
  id bigint generated always as identity primary key,
  name text not null,
  type text not null,
  request text not null,
  owner text not null,
  version text not null default 'v1',
  updated text not null
);

alter table public.documents add column if not exists content_type text;
alter table public.documents add column if not exists size integer;

-- Ligação real a quem o documento pertence — "request" | "supplier" |
-- "invoice" | "receipt" | "exception" | "purchase_order", com entity_id a
-- guardar o id dessa linha. Alimenta os botões "Ver evidência"/"Ver
-- Supplier Passport"/etc. no frontend (lib/document-access.ts decide
-- quem pode aceder a cada entidade). Nulo para uploads gerais do
-- Repositório, sem entidade específica.
alter table public.documents add column if not exists entity_type text;
alter table public.documents add column if not exists entity_id text;

-- Ficheiro real associado a um documento — separado de `documents` para
-- que listar/pesquisar nunca puxe os bytes de todos os ficheiros para
-- memória; só a rota de download toca esta tabela.
create table if not exists public.document_files (
  document_id bigint primary key references public.documents (id),
  content bytea not null
);

-- Candidatura de uma empresa ou fornecedor ao Centro de Excelência — o
-- primeiro contacto real com a plataforma, para quem ainda não tem conta
-- nenhuma. Só a homologação (aprovada -> homologada) cria de facto a
-- empresa/fornecedor e o primeiro utilizador — ver app/api/applications.
create table if not exists public.applications (
  id text primary key, -- "CAND-2026-####"
  kind text not null, -- empresa | fornecedor
  company_name text not null,
  tax_id text not null,
  sector text not null default '',
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null default '',
  notes text not null default '',
  status text not null default 'recebida', -- recebida | em_avaliacao | aprovada | rejeitada | homologada
  rejection_reason text,
  assigned_to_user_id bigint references public.users (id),
  reviewed_by_user_id bigint references public.users (id),
  reviewed_at timestamptz,
  homologated_at timestamptz,
  created_company_id bigint references public.companies (id),
  created_supplier_id bigint references public.suppliers (id),
  created_user_id bigint references public.users (id),
  created_at timestamptz not null default now()
);
alter table public.applications add column if not exists assigned_to_user_id bigint references public.users (id);

-- Caixa de suporte: qualquer utilizador autenticado pode abrir um pedido;
-- só o System Admin vê a caixa de entrada completa. Ver lib/support.ts
-- para o cálculo do prazo de SLA por prioridade.
create table if not exists public.support_tickets (
  id text primary key, -- "SUP-2026-####"
  subject text not null,
  category text not null default 'Geral',
  priority text not null default 'normal', -- baixa | normal | alta | urgente
  status text not null default 'aberto', -- aberto | em_curso | resolvido | fechado
  user_id bigint not null references public.users (id),
  company_id bigint references public.companies (id),
  assigned_to_user_id bigint references public.users (id),
  sla_due_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id text not null references public.support_tickets (id),
  author_user_id bigint not null references public.users (id),
  body text not null,
  created_at timestamptz not null default now()
);

-- Marca um token de uso único (jti) como já consumido — recuperação de
-- acesso/boas-vindas (password_reset), que só devem poder repor a
-- password uma vez. A PK em jti é a própria garantia de uso único.
create table if not exists public.consumed_tokens (
  jti text primary key,
  purpose text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now()
);

-- Preço por unidade (Estudo de Viabilidade §32.4/53.1 — modelo híbrido
-- retainer + PO + factura). Editável via SQL directo por agora.
create table if not exists public.billing_rates (
  key text primary key, -- po_automatico | po_standard | po_complexo | invoice_limpa | invoice_assistida | invoice_excecao
  label text not null,
  amount bigint not null,
  updated_at timestamptz not null default now()
);

-- Factura de cobrança da Muntu a uma empresa cliente (distinta de
-- `invoices`, que são facturas de fornecedor no fluxo Invoice-to-Pay).
create table if not exists public.client_invoices (
  id text primary key,
  company_id bigint not null references public.companies (id),
  period_start text not null,
  period_end text not null,
  scope text not null default 'total', -- parcial | total
  status text not null default 'pendente_aprovacao', -- pendente_aprovacao | aprovada | rejeitada | enviada_contabilidade
  generated_by text not null default 'manual', -- automatico | manual
  retainer_amount bigint not null default 0,
  po_amount bigint not null default 0,
  invoice_amount bigint not null default 0,
  total_amount bigint not null default 0,
  created_at timestamptz not null default now(),
  reviewed_by_user_id bigint references public.users (id),
  reviewed_at timestamptz
);

create table if not exists public.client_invoice_lines (
  id bigint generated always as identity primary key,
  client_invoice_id text not null references public.client_invoices (id),
  kind text not null, -- retainer | po | invoice
  reference_id text,
  tier text,
  description text not null,
  amount bigint not null
);

-- -----------------------------------------------------------------
-- Índices úteis para pesquisa/filtros
-- -----------------------------------------------------------------

create index if not exists idx_requests_status on public.requests (status);
create index if not exists idx_requests_supplier on public.requests (supplier);
create index if not exists idx_invoices_status on public.invoices (status);
create index if not exists idx_exceptions_resolved on public.exceptions (resolved);
create index if not exists idx_payment_batches_released on public.payment_batches (released);
create index if not exists idx_applications_status on public.applications (status);

-- -----------------------------------------------------------------
-- Row Level Security
-- Estas políticas são permissivas (leitura/escrita públicas) para
-- corresponder ao comportamento actual do backend de demonstração.
-- Antes de ir para produção, restrinja `using`/`with check` a
-- `auth.uid()` ou a um papel de serviço, e nunca exponha a coluna
-- `password` de `users` através da API pública (use Supabase Auth).
-- -----------------------------------------------------------------

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.requests enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.receipts enable row level security;
alter table public.invoices enable row level security;
alter table public.exceptions enable row level security;
alter table public.payment_batches enable row level security;
alter table public.documents enable row level security;
alter table public.document_files enable row level security;
alter table public.billing_rates enable row level security;
alter table public.client_invoices enable row level security;
alter table public.client_invoice_lines enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.applications enable row level security;
alter table public.consumed_tokens enable row level security;
alter table public.tenders enable row level security;
alter table public.tender_invites enable row level security;
alter table public.bids enable row level security;
alter table public.contracts enable row level security;
alter table public.catalog_items enable row level security;

drop policy if exists "public read requests" on public.requests;
drop policy if exists "public write requests" on public.requests;
drop policy if exists "public update requests" on public.requests;
create policy "public read requests" on public.requests for select using (true);
create policy "public write requests" on public.requests for insert with check (true);
create policy "public update requests" on public.requests for update using (true);

drop policy if exists "public read suppliers" on public.suppliers;
drop policy if exists "public write suppliers" on public.suppliers;
create policy "public read suppliers" on public.suppliers for select using (true);
create policy "public write suppliers" on public.suppliers for insert with check (true);

drop policy if exists "public read purchase_orders" on public.purchase_orders;
create policy "public read purchase_orders" on public.purchase_orders for select using (true);

drop policy if exists "public read receipts" on public.receipts;
drop policy if exists "public update receipts" on public.receipts;
create policy "public read receipts" on public.receipts for select using (true);
create policy "public update receipts" on public.receipts for update using (true);

drop policy if exists "public read invoices" on public.invoices;
create policy "public read invoices" on public.invoices for select using (true);

drop policy if exists "public read exceptions" on public.exceptions;
drop policy if exists "public update exceptions" on public.exceptions;
create policy "public read exceptions" on public.exceptions for select using (true);
create policy "public update exceptions" on public.exceptions for update using (true);

drop policy if exists "public read payment_batches" on public.payment_batches;
drop policy if exists "public update payment_batches" on public.payment_batches;
create policy "public read payment_batches" on public.payment_batches for select using (true);
create policy "public update payment_batches" on public.payment_batches for update using (true);

drop policy if exists "public read documents" on public.documents;
drop policy if exists "public write documents" on public.documents;
create policy "public read documents" on public.documents for select using (true);
create policy "public write documents" on public.documents for insert with check (true);

-- Sem política de select em `users`, `companies`, `billing_rates`,
-- `client_invoices`, `client_invoice_lines`, `document_files`,
-- `support_tickets`, `support_messages`, `applications`,
-- `consumed_tokens`, `tenders`, `tender_invites`, `bids` (propostas de
-- fornecedores concorrentes nunca podem ficar legíveis por anon key),
-- `contracts` nem `catalog_items` (valores, termos contratuais e preços
-- pré-negociados são dados comerciais sensíveis): mantém-nas
-- ilegíveis pela API pública/anon key (segredos de SSO, dados financeiros,
-- dados de candidatos, bytes reais dos
-- ficheiros carregados e conteúdo de pedidos de suporte dos utilizadores).
-- Login, SSO, facturação, upload/download de documentos e a caixa de
-- suporte só podem correr a partir de rotas de servidor com a service
-- role key.

-- -----------------------------------------------------------------
-- Configuração real (não é dado de demonstração)
-- -----------------------------------------------------------------

-- Tarifas de facturação — valores reais do Estudo de Viabilidade
-- §32.4/53.1 (ponto médio de cada intervalo indicativo, em AOA), exigidos
-- para o motor de facturação (lib/billing.ts) conseguir calcular preço
-- nenhum, mesmo sem clientes reais ainda. Ao contrário do que existia
-- antes aqui (empresa/utilizadores/pedidos/fornecedores/POs/facturas/
-- excepções/pagamentos/documentos fictícios — "Operadora Atlântico, SA",
-- "Ana Manuel", "Kwanza Industrial", etc.), isto não é actividade de
-- negócio inventada: é configuração de preços que o sistema precisa para
-- funcionar, editável depois em Facturação → Tarifas (system_admin).
insert into public.billing_rates (key, label, amount) values
  ('po_automatico', 'PO automático/catalogado', 7000),
  ('po_standard', 'PO standard assistido', 10500),
  ('po_complexo', 'PO complexo/urgente', 26500),
  ('invoice_limpa', 'Factura limpa (3-way match)', 3750),
  ('invoice_assistida', 'Factura standard assistida', 5500),
  ('invoice_excecao', 'Factura com excepção/disputa', 11500)
on conflict (key) do nothing;

-- Sem dados de demonstração aqui de propósito: uma empresa, os seus
-- utilizadores, pedidos, fornecedores, POs, recepções, facturas,
-- excepções, pagamentos e documentos fictícios só devem existir numa
-- base de dados local/de testes (ver `npm run db:seed` e
-- db/seed-data.ts), nunca na base de dados real do Supabase — este
-- ficheiro é colado directamente lá. A primeira conta real
-- (coe_manager/system_admin) cria-se com
-- `npx tsx scripts/create-owner-admins.ts` (ver README); as restantes
-- entram por SSO/convite normal, e todo o resto (empresas clientes,
-- fornecedores, pedidos, POs, ...) preenche-se com uso real da
-- plataforma, nunca com dados fictícios pré-inseridos.
