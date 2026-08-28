import { sql } from "drizzle-orm";
import { bigint, boolean, customType, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Empresa cliente (a "tenant" que compra através do portal). O método de
// login (SSO federado vs. e-mail/password) é decidido por empresa: o login
// resolve o domínio do e-mail para uma linha aqui antes de decidir qual
// fluxo mostrar. As colunas sso_* só produzem um login funcional quando a
// empresa fornece as credenciais reais do seu fornecedor de identidade
// (Entra ID, Google Workspace, Okta, ...) — ver README para o fluxo OIDC.
export const companies = pgTable("companies", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  authMethod: text("auth_method").notNull().default("password"), // "password" | "sso"
  ssoIssuerUrl: text("sso_issuer_url"),
  ssoClientId: text("sso_client_id"),
  ssoClientSecret: text("sso_client_secret"),
  // Retainer mensal negociado (AOA). Sem valor definido, a facturação de
  // actividade usa 0 para esta linha — ver Estudo de Viabilidade §32.4/53.1.
  retainerAmount: bigint("retainer_amount", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const users = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Nula para utilizadores federados por SSO (não têm password local).
  password: text("password"),
  role: text("role").notNull(),
  initials: text("initials").notNull(),
  tenant: text("tenant").notNull().default("Operadora Atlântico, SA"),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  // Só para accessLevel = "supplier": qual fornecedor este utilizador
  // representa. Sem isto ligado, o utilizador não vê POs/recepções/
  // facturas nenhumas (âmbito vazio por omissão — nunca "vê tudo").
  supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
  // Autorização real (usada por middleware/rotas).
  accessLevel: text("access_level").notNull().default("requester"), // system_admin | coe_manager | analyst | supplier | company_admin | requester
  ssoSubject: text("sso_subject"),
});

export const requests = pgTable("requests", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  tower: text("tower").notNull(),
  // Tipo de transacção escolhido no wizard (ex.: "PO standard", "Compra
  // urgente", "PO catalogado"). Determina o tier de facturação da PO
  // gerada na aprovação — ver lib/billing.ts.
  type: text("type").notNull().default("PO standard"),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  owner: text("owner").notNull(),
  ownerUserId: bigint("owner_user_id", { mode: "number" }).references(() => users.id),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  sla: text("sla").notNull(),
  stage: integer("stage").notNull().default(0),
  submitted: text("submitted").notNull(),
  supplier: text("supplier").notNull(),
  costCenter: text("cost_center").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const suppliers = pgTable("suppliers", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  passport: integer("passport").notNull().default(0),
  risk: text("risk").notNull().default("Médio"),
  local: text("local").notNull().default("0%"),
  status: text("status").notNull().default("Documentos"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey(),
  supplier: text("supplier").notNull(),
  description: text("description").notNull(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  status: text("status").notNull(),
  nextAction: text("next_action").notNull().default(""),
  requestId: text("request_id").references(() => requests.id),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
  // automatico | standard | complexo — ver lib/billing.ts
  tier: text("tier").notNull().default("standard"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const receipts = pgTable("receipts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  po: text("po").notNull(),
  description: text("description").notNull(),
  supplier: text("supplier").notNull(),
  supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  progress: integer("progress").notNull().default(0),
  status: text("status").notNull().default("Em curso"),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  supplier: text("supplier").notNull(),
  po: text("po").notNull(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  match: text("match").notNull(),
  status: text("status").notNull(),
  due: text("due").notNull(),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
  // limpa | assistida | excecao — ver lib/billing.ts
  tier: text("tier").notNull().default("assistida"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const exceptions = pgTable("exceptions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  ref: text("ref").notNull(),
  owner: text("owner").notNull(),
  age: text("age").notNull(),
  impact: text("impact").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
});

export const paymentBatches = pgTable("payment_batches", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  count: integer("count").notNull().default(0),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("Pronto"),
  released: boolean("released").notNull().default(false),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
});

// Tabelas de preço por unidade (Estudo de Viabilidade §32.4/53.1 —
// modelo híbrido retainer + PO + factura). Valores por omissão são o
// ponto médio de cada intervalo indicativo do estudo, em AOA. Editável
// via SQL directo por agora (sem UI de administração de preços).
export const billingRates = pgTable("billing_rates", {
  key: text("key").primaryKey(), // po_automatico | po_standard | po_complexo | invoice_limpa | invoice_assistida | invoice_excecao
  label: text("label").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Factura de cobrança da Muntu a uma empresa cliente (distinta de
// `invoices`, que são as facturas de fornecedor no fluxo Invoice-to-Pay).
export const clientInvoices = pgTable("client_invoices", {
  id: text("id").primaryKey(),
  companyId: bigint("company_id", { mode: "number" })
    .notNull()
    .references(() => companies.id),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  scope: text("scope").notNull().default("total"), // parcial | total
  status: text("status").notNull().default("pendente_aprovacao"), // pendente_aprovacao | aprovada | rejeitada | enviada_contabilidade
  generatedBy: text("generated_by").notNull().default("manual"), // automatico | manual
  retainerAmount: bigint("retainer_amount", { mode: "number" }).notNull().default(0),
  poAmount: bigint("po_amount", { mode: "number" }).notNull().default(0),
  invoiceAmount: bigint("invoice_amount", { mode: "number" }).notNull().default(0),
  totalAmount: bigint("total_amount", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  reviewedByUserId: bigint("reviewed_by_user_id", { mode: "number" }).references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const clientInvoiceLines = pgTable("client_invoice_lines", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  clientInvoiceId: text("client_invoice_id")
    .notNull()
    .references(() => clientInvoices.id),
  kind: text("kind").notNull(), // retainer | po | invoice
  referenceId: text("reference_id"), // id da PO ou da factura de fornecedor de origem
  tier: text("tier"),
  description: text("description").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
});

export const documents = pgTable("documents", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  request: text("request").notNull(),
  owner: text("owner").notNull(),
  version: text("version").notNull().default("v1"),
  updated: text("updated").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
});

// Ficheiro real associado a um `documents.id` — separado da tabela acima
// para que listar/pesquisar documentos (`GET /api/documents`) nunca puxe
// os bytes de todos os ficheiros para memória; só `GET
// /api/documents/:id/download` toca esta tabela.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const documentFiles = pgTable("document_files", {
  documentId: bigint("document_id", { mode: "number" })
    .primaryKey()
    .references(() => documents.id),
  content: bytea("content").notNull(),
});
