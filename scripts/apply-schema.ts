// Aplica supabase/schema.sql à base de dados de DATABASE_URL — o mesmo
// ficheiro que, até agora, só era aplicado manualmente colando-o no SQL
// Editor do Supabase. Isto já causou produção a ficar atrás do código real
// três vezes nesta aplicação (support_tickets, documents.entity_type/
// entity_id, applications) porque nada automatizava o passo. Corre como
// parte do deploy (ver render.yaml) — idempotente por desenho, porque o
// próprio schema.sql só usa `create table if not exists`/`add column if
// not exists`.
import path from "node:path";
import { setDefaultResultOrder } from "node:dns";
import postgres from "postgres";

setDefaultResultOrder("ipv4first"); // ver db/index.ts — Render não tem saída IPv6

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn("[apply-schema] DATABASE_URL não está definida — a saltar (não bloqueia o deploy).");
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(connectionString);
  } catch (error) {
    throw new Error(
      `[apply-schema] DATABASE_URL não é um URL válido: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (parsedUrl.hostname.endsWith(".supabase.co") && !parsedUrl.hostname.includes("pooler")) {
    throw new Error(
      `[apply-schema] DATABASE_URL aponta para a ligação directa (${parsedUrl.hostname}), IPv6-only — use a connection string do separador Transaction (pooler).`
    );
  }
  const sslMode = parsedUrl.searchParams.get("sslmode") === "disable" ? false : "require";

  const schemaPath = path.join(process.cwd(), "supabase", "schema.sql");
  const sql = postgres(connectionString, { prepare: false, ssl: sslMode, max: 1 });

  try {
    console.log(`[apply-schema] A aplicar ${schemaPath}…`);
    await sql.file(schemaPath);
    console.log("[apply-schema] Schema aplicado com sucesso.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("[apply-schema] Falhou:", error instanceof Error ? error.message : error);
  process.exit(1);
});
