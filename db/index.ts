import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed-data";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "muntu.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

declare global {
  // eslint-disable-next-line no-var
  var __muntuSqlite: Database.Database | undefined;
}

const sqlite = globalThis.__muntuSqlite ?? new Database(DB_PATH);
if (process.env.NODE_ENV !== "production") {
  globalThis.__muntuSqlite = sqlite;
}

sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    initials TEXT NOT NULL,
    tenant TEXT NOT NULL DEFAULT 'Operadora Atlântico, SA'
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    tower TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    owner TEXT NOT NULL,
    sla TEXT NOT NULL,
    stage INTEGER NOT NULL DEFAULT 0,
    submitted TEXT NOT NULL,
    supplier TEXT NOT NULL,
    cost_center TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    passport INTEGER NOT NULL DEFAULT 0,
    risk TEXT NOT NULL DEFAULT 'Médio',
    local TEXT NOT NULL DEFAULT '0%',
    status TEXT NOT NULL DEFAULT 'Documentos',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    supplier TEXT NOT NULL,
    description TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    next_action TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po TEXT NOT NULL,
    description TEXT NOT NULL,
    supplier TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    progress INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Em curso'
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    supplier TEXT NOT NULL,
    po TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    match TEXT NOT NULL,
    status TEXT NOT NULL,
    due TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exceptions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    ref TEXT NOT NULL,
    owner TEXT NOT NULL,
    age TEXT NOT NULL,
    impact TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS payment_batches (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    value INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pronto',
    released INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    request TEXT NOT NULL,
    owner TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT 'v1',
    updated TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite, { schema });

seedIfEmpty(db);

export function getDb() {
  return db;
}
