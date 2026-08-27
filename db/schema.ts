import { sql } from "drizzle-orm";
import { bigint, boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
  // Autorização real (usada por middleware/rotas). "muntu_ops" e "supplier"
  // não pertencem a uma empresa cliente; "company_admin" e "requester" são
  // as duas personas do lado do cliente.
  accessLevel: text("access_level").notNull().default("requester"), // muntu_ops | supplier | company_admin | requester
  ssoSubject: text("sso_subject"),
});

export const requests = pgTable("requests", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  tower: text("tower").notNull(),
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
});

export const receipts = pgTable("receipts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  po: text("po").notNull(),
  description: text("description").notNull(),
  supplier: text("supplier").notNull(),
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
});

export const exceptions = pgTable("exceptions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  ref: text("ref").notNull(),
  owner: text("owner").notNull(),
  age: text("age").notNull(),
  impact: text("impact").notNull(),
  resolved: boolean("resolved").notNull().default(false),
});

export const paymentBatches = pgTable("payment_batches", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  count: integer("count").notNull().default(0),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("Pronto"),
  released: boolean("released").notNull().default(false),
});

export const documents = pgTable("documents", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  request: text("request").notNull(),
  owner: text("owner").notNull(),
  version: text("version").notNull().default("v1"),
  updated: text("updated").notNull(),
});
