import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { parseLimit } from "@/lib/pagination";

// Leitura do registo de operações críticas — só System Admin chega aqui
// (ver ROUTE_ACCESS em middleware.ts, prefixo /api/admin), é a auditoria
// que lhe resta depois de perder os poderes de negócio no redesenho de
// RBAC (ver README §Personas e permissões). Filtros opcionais por
// entidade/actor, mais recente primeiro.
export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType")?.trim();
  const actorUserIdRaw = searchParams.get("actorUserId");
  const actorUserId = actorUserIdRaw ? Number(actorUserIdRaw) : null;

  const conditions = [];
  if (entityType) conditions.push(eq(auditLog.entityType, entityType));
  if (actorUserId != null && Number.isFinite(actorUserId)) conditions.push(eq(auditLog.actorUserId, actorUserId));

  const rows = await db
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(parseLimit(request));

  const actorRows = await db.select().from(users);
  const actorNameById = new Map(actorRows.map((u) => [u.id, u.name]));

  return Response.json({
    entries: rows.map((row) => ({ ...row, actorName: row.actorUserId != null ? (actorNameById.get(row.actorUserId) ?? "—") : "Agendador externo" })),
  });
}
