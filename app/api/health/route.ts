import { sql } from "drizzle-orm";
import { getDb } from "@/db";

// Ping simples para monitorização (Render, um futuro load balancer, ou um
// uptime check externo) — sem sessão, porque quem chama isto normalmente
// não tem nenhuma. Verifica mesmo a ligação à base de dados: um "ok"
// falso (processo vivo mas sem conseguir falar com o Postgres) é pior do
// que nenhum health check.
export async function GET() {
  const db = getDb();
  try {
    await db.execute(sql`select 1`);
  } catch {
    return Response.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
  return Response.json({ status: "ok", db: "up" });
}
