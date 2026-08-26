import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não está definida. Defina-a com a connection string do Supabase (Project Settings → Database → Connection string → URI)."
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __muntuPg: ReturnType<typeof postgres> | undefined;
}

const client = globalThis.__muntuPg ?? postgres(connectionString, { prepare: false });
if (process.env.NODE_ENV !== "production") {
  globalThis.__muntuPg = client;
}

export const db = drizzle(client, { schema });

export function getDb() {
  return db;
}
