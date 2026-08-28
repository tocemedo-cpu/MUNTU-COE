import { setDefaultResultOrder } from "node:dns";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// Render has no IPv6 egress. Node 18+ can otherwise pick a host's AAAA
// record first and fail with ENETUNREACH even when an A record exists
// (e.g. Supabase's pooler). Always prefer IPv4 when both are available.
setDefaultResultOrder("ipv4first");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não está definida. Defina-a com a connection string do Supabase (Project Settings → Database → Connection string → separador Transaction)."
  );
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(connectionString);
} catch (error) {
  throw new Error(
    "DATABASE_URL não é um URL válido. A causa mais comum é a palavra-passe ter caracteres especiais (@ # % / : ?) sem estarem percent-encoded — ex.: '@' tem de ser escrito '%40'. " +
      `Erro original: ${error instanceof Error ? error.message : String(error)}`
  );
}

if (parsedUrl.hostname.endsWith(".supabase.co") && !parsedUrl.hostname.includes("pooler")) {
  throw new Error(
    `DATABASE_URL aponta para a ligação directa (${parsedUrl.hostname}), que é IPv6-only e o Render não tem saída IPv6. ` +
      "Use a connection string do separador Transaction (pooler), com anfitrião do tipo aws-0-<região>.pooler.supabase.com."
  );
}

declare global {
  var __muntuPg: ReturnType<typeof postgres> | undefined;
}

// Produção (Supabase) exige sempre SSL. A única forma de o desligar é o
// próprio DATABASE_URL pedir `sslmode=disable` explicitamente — usado só
// por uma base de dados Postgres local para testes de integração (ver
// tests/integration), nunca em produção.
const sslMode = parsedUrl.searchParams.get("sslmode") === "disable" ? false : "require";

let client: ReturnType<typeof postgres>;
try {
  client = globalThis.__muntuPg ?? postgres(connectionString, { prepare: false, ssl: sslMode });
} catch (error) {
  throw new Error(
    `Falha ao inicializar o cliente Postgres a partir de DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`
  );
}
if (process.env.NODE_ENV !== "production") {
  globalThis.__muntuPg = client;
}

export const db = drizzle(client, { schema });

export function getDb() {
  return db;
}
