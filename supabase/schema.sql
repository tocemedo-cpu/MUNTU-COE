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
alter table public.purchase_orders add column if not exists tier text not null default 'standard'; -- automatico | standard | complexo
alter table public.purchase_orders add column if not exists created_at timestamptz not null default now();

create table if not exists public.receipts (
  id bigint generated always as identity primary key,
  po text not null,
  description text not null,
  supplier text not null,
  value bigint not null default 0,
  progress integer not null default 0,
  status text not null default 'Em curso'
);

create table if not exists public.invoices (
  id text primary key,
  supplier text not null,
  po text not null,
  value bigint not null default 0,
  match text not null,
  status text not null,
  due text not null
);

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

create table if not exists public.payment_batches (
  id text primary key,
  date text not null,
  count integer not null default 0,
  value bigint not null default 0,
  status text not null default 'Pronto',
  released boolean not null default false
);

create table if not exists public.documents (
  id bigint generated always as identity primary key,
  name text not null,
  type text not null,
  request text not null,
  owner text not null,
  version text not null default 'v1',
  updated text not null
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
alter table public.billing_rates enable row level security;
alter table public.client_invoices enable row level security;
alter table public.client_invoice_lines enable row level security;

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
-- `client_invoices` nem `client_invoice_lines`: mantém-nas ilegíveis pela
-- API pública/anon key (segredos de SSO e dados financeiros). Login, SSO
-- e facturação só podem correr a partir de rotas de servidor com a
-- service role key.

-- -----------------------------------------------------------------
-- Dados de demonstração
-- -----------------------------------------------------------------

insert into public.companies (name, domain, auth_method) values
  ('Operadora Atlântico, SA', 'operadora.ao', 'password')
on conflict (domain) do nothing;

insert into public.users (name, email, password, role, initials, tenant) values
  ('Ana Manuel', 'ana.manuel@operadora.ao', 'Muntu2026!', 'Requisitante', 'AM', 'Operadora Atlântico, SA'),
  ('João Sebastião', 'joao.sebastiao@operadora.ao', 'Muntu2026!', 'Administrador da empresa', 'JS', 'Operadora Atlântico, SA'),
  ('Marta Miguel', 'marta.miguel@muntucoe.ao', 'Muntu2026!', 'COE Manager', 'MM', 'Operadora Atlântico, SA'),
  ('Sofia Neto', 'sofia.neto@muntucoe.ao', 'Muntu2026!', 'Analista (Buyer/AP)', 'SN', 'Operadora Atlântico, SA'),
  ('Rui Domingos', 'rui.domingos@muntucoe.ao', 'Muntu2026!', 'System Admin', 'RD', 'Operadora Atlântico, SA'),
  ('Carlos Mateus', 'carlos.mateus@kwanzaindustrial.ao', 'Muntu2026!', 'Fornecedor', 'CM', 'Operadora Atlântico, SA')
on conflict (email) do nothing;

-- Backfill: liga os utilizadores de demonstração à empresa e ao nível de
-- acesso correcto. Seguro de repetir (define sempre os mesmos valores).
-- Inclui a renomeação do antigo nível 'muntu_ops' para 'coe_manager',
-- para quem já tinha corrido uma versão anterior deste script.
update public.users
set role = 'Requisitante', access_level = 'requester', company_id = c.id
from public.companies c
where c.domain = 'operadora.ao' and public.users.email = 'ana.manuel@operadora.ao';

update public.users
set role = 'Administrador da empresa', access_level = 'company_admin', company_id = c.id
from public.companies c
where c.domain = 'operadora.ao' and public.users.email = 'joao.sebastiao@operadora.ao';

update public.users set role = 'COE Manager', access_level = 'coe_manager' where email = 'marta.miguel@muntucoe.ao';
update public.users set access_level = 'coe_manager' where access_level = 'muntu_ops';
update public.users set access_level = 'analyst' where email = 'sofia.neto@muntucoe.ao';
update public.users set access_level = 'system_admin' where email = 'rui.domingos@muntucoe.ao';
update public.users set access_level = 'supplier' where email = 'carlos.mateus@kwanzaindustrial.ao';

insert into public.requests (id, subject, tower, type, value, status, priority, owner, sla, stage, submitted, supplier, cost_center) values
  ('REQ-2026-0814', 'Válvulas de controlo — Kizomba B', 'Requisition-to-PO', 'PO standard', 84000000, 'Aprovação', 'Alta', 'Carlos Mateus', '03h 12m', 2, '26 Ago, 09:14', 'Kwanza Industrial', 'OFS-OPS-210'),
  ('REQ-2026-0813', 'Inspecção NDT offshore', 'Serviços técnicos', 'Compra urgente', 31600000, 'Em execução', 'Alta', 'Marta Miguel', '18h 40m', 3, '25 Ago, 15:42', 'Atlântico Integrity', 'INT-B15-105'),
  ('REQ-2026-0812', 'Calibração de PRV — campanha Q3', 'PO-to-Receipt', 'PO standard', 12450000, 'Receção', 'Média', 'Domingos José', '1d 04h', 4, '24 Ago, 11:20', 'Luanda Calibration Services', 'MAI-PRV-330'),
  ('REQ-2026-0809', 'Consumíveis de manutenção', 'Invoice-to-Pay', 'PO catalogado', 5980000, 'Excepção', 'Média', 'Ana Manuel', 'Vencido 2h', 6, '22 Ago, 08:05', 'Mwangolé Supplies', 'MRO-BASE-090'),
  ('REQ-2026-0804', 'Transporte de equipa para Soyo', 'Invoice-to-Pay', 'PO standard', 3200000, 'Pago', 'Normal', 'Ana Manuel', 'Concluído', 7, '19 Ago, 13:37', 'Norte Logística', 'LOG-SOY-011')
on conflict (id) do nothing;

-- Backfill: liga os pedidos de demonstração à empresa e, quando o dono
-- corresponde a um utilizador real, ao respectivo owner_user_id.
update public.requests r
set company_id = c.id
from public.companies c
where c.domain = 'operadora.ao';

update public.requests r
set owner_user_id = u.id
from public.users u
where u.email = 'ana.manuel@operadora.ao' and r.owner = 'Ana Manuel';

insert into public.suppliers (name, category, passport, risk, local, status) values
  ('Kwanza Industrial', 'Válvulas e MRO', 96, 'Baixo', '92%', 'Activo'),
  ('Atlântico Integrity', 'NDT e Integridade', 88, 'Baixo', '78%', 'Activo'),
  ('Luanda Calibration Services', 'Calibração', 81, 'Médio', '100%', 'Revisão'),
  ('Mwangolé Supplies', 'Consumíveis', 73, 'Médio', '85%', 'Documentos'),
  ('Norte Logística', 'Transporte', 91, 'Baixo', '100%', 'Activo')
on conflict (name) do nothing;

insert into public.purchase_orders (id, supplier, description, value, status, next_action, tier) values
  ('PO-6100432', 'Kwanza Industrial', 'Válvulas de controlo', 84000000, 'Expediting', '02 Set', 'standard'),
  ('PO-6100424', 'Atlântico Integrity', 'Inspecção NDT offshore', 31600000, 'Confirmado', '30 Ago', 'complexo'),
  ('PO-6100411', 'Mwangolé Supplies', 'Consumíveis MRO', 5980000, 'Excepção', 'Hoje', 'automatico'),
  ('PO-6100380', 'Luanda Calibration Services', 'Calibração PRV', 12450000, 'Entregue', 'Receber', 'standard')
on conflict (id) do nothing;

insert into public.receipts (po, description, supplier, value, progress, status) values
  ('PO-6100380', 'Calibração PRV — campanha Q3', 'Luanda Calibration Services', 12450000, 100, 'A confirmar'),
  ('PO-6100432', 'Válvulas de controlo — lote 1/2', 'Kwanza Industrial', 42000000, 50, '02 Set'),
  ('PO-6100424', 'Inspecção NDT — mobilização', 'Atlântico Integrity', 9480000, 30, 'Em curso');

insert into public.invoices (id, supplier, po, value, match, status, due) values
  ('FT-2026-1198', 'Kwanza Industrial', 'PO-6100432', 42000000, '3-way match', 'Validada', '04 Set'),
  ('FT-2026-1192', 'Mwangolé Supplies', 'PO-6100411', 5980000, 'Preço divergente', 'Excepção', 'Hoje'),
  ('FT-2026-1186', 'Norte Logística', 'PO-6100398', 3200000, '3-way match', 'Pago', 'Concluído'),
  ('FT-2026-1179', 'Luanda Calibration Services', 'PO-6100380', 12450000, 'Receção em falta', 'Pendente', '29 Ago')
on conflict (id) do nothing;

-- Backfill: liga POs e facturas de demonstração à empresa, e classifica
-- o tier de facturação (mesma regra de lib/billing.ts).
update public.purchase_orders po
set company_id = c.id
from public.companies c
where c.domain = 'operadora.ao';

update public.invoices i
set company_id = c.id,
    tier = case
      when i.status = 'Excepção' then 'excecao'
      when i.match = '3-way match' then 'limpa'
      else 'assistida'
    end
from public.companies c
where c.domain = 'operadora.ao';

insert into public.billing_rates (key, label, amount) values
  ('po_automatico', 'PO automático/catalogado', 7000),
  ('po_standard', 'PO standard assistido', 10500),
  ('po_complexo', 'PO complexo/urgente', 26500),
  ('invoice_limpa', 'Factura limpa (3-way match)', 3750),
  ('invoice_assistida', 'Factura standard assistida', 5500),
  ('invoice_excecao', 'Factura com excepção/disputa', 11500)
on conflict (key) do nothing;

insert into public.exceptions (id, title, ref, owner, age, impact) values
  ('EXC-0264', 'Preço da factura diverge do PO em 4,8%', 'FT-2026-1192 • PO-6100411', 'Comprador', '2h 14m', 'AOA 286 000'),
  ('EXC-0261', 'Recepção de serviço não registada', 'FT-2026-1179 • PO-6100380', 'Requisitante', '7h 38m', 'AOA 12 450 000'),
  ('EXC-0258', 'Certificado fiscal expirado', 'Supplier Passport • Mwangolé Supplies', 'Fornecedor', '1d 03h', 'Bloqueio de pagamento')
on conflict (id) do nothing;

insert into public.payment_batches (id, date, count, value, status, released) values
  ('PAY-2026-035', '28 Ago 2026', 8, 68450000, 'Pronto', false),
  ('PAY-2026-034', '25 Ago 2026', 11, 102980000, 'Pago', true),
  ('PAY-2026-033', '21 Ago 2026', 6, 44200000, 'Pago', true)
on conflict (id) do nothing;

insert into public.documents (name, type, request, owner, version, updated) values
  ('Contrato_MRO_2026.pdf', 'Contrato', 'REQ-2026-0814', 'Carlos Mateus', 'v3', 'Há 18 min'),
  ('Certificados_PRV_Q3.zip', 'Certificação', 'REQ-2026-0812', 'Marta Miguel', 'v1', 'Hoje, 10:21'),
  ('Acta_Rececao_PO6100380.pdf', 'Receção', 'REQ-2026-0812', 'Domingos José', 'v2', 'Ontem'),
  ('Parecer_Fiscal_AOA.pdf', 'Compliance', 'POL-2026-04', 'Muntu Legal', 'v5', '22 Ago');
