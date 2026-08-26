import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(),
  initials: text("initials").notNull(),
  tenant: text("tenant").notNull().default("Operadora Atlântico, SA"),
});

export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  tower: text("tower").notNull(),
  value: integer("value").notNull().default(0),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  owner: text("owner").notNull(),
  sla: text("sla").notNull(),
  stage: integer("stage").notNull().default(0),
  submitted: text("submitted").notNull(),
  supplier: text("supplier").notNull(),
  costCenter: text("cost_center").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  passport: integer("passport").notNull().default(0),
  risk: text("risk").notNull().default("Médio"),
  local: text("local").notNull().default("0%"),
  status: text("status").notNull().default("Documentos"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: text("id").primaryKey(),
  supplier: text("supplier").notNull(),
  description: text("description").notNull(),
  value: integer("value").notNull().default(0),
  status: text("status").notNull(),
  nextAction: text("next_action").notNull().default(""),
});

export const receipts = sqliteTable("receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  po: text("po").notNull(),
  description: text("description").notNull(),
  supplier: text("supplier").notNull(),
  value: integer("value").notNull().default(0),
  progress: integer("progress").notNull().default(0),
  status: text("status").notNull().default("Em curso"),
});

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  supplier: text("supplier").notNull(),
  po: text("po").notNull(),
  value: integer("value").notNull().default(0),
  match: text("match").notNull(),
  status: text("status").notNull(),
  due: text("due").notNull(),
});

export const exceptions = sqliteTable("exceptions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  ref: text("ref").notNull(),
  owner: text("owner").notNull(),
  age: text("age").notNull(),
  impact: text("impact").notNull(),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
});

export const paymentBatches = sqliteTable("payment_batches", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  count: integer("count").notNull().default(0),
  value: integer("value").notNull().default(0),
  status: text("status").notNull().default("Pronto"),
  released: integer("released", { mode: "boolean" }).notNull().default(false),
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  request: text("request").notNull(),
  owner: text("owner").notNull(),
  version: text("version").notNull().default("v1"),
  updated: text("updated").notNull(),
});
