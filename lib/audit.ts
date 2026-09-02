import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

/** Regista uma operação crítica no audit log — ver db/schema.ts#auditLog.
 * actorUserId nulo cobre acções do agendador externo (via CRON_SECRET),
 * nunca de uma sessão sem utilizador real. before/after são serializados
 * como JSON (mesmo padrão do resto do schema, que não usa jsonb nativo em
 * lado nenhum) — passe só os campos que mudaram, não a linha inteira. */
export async function recordAuditEvent(
  db: ReturnType<typeof getDb>,
  params: {
    actorUserId?: number | null;
    action: string;
    entityType: string;
    entityId: string | number;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: params.actorUserId ?? null,
    action: params.action,
    entityType: params.entityType,
    entityId: String(params.entityId),
    before: params.before ? JSON.stringify(params.before) : null,
    after: params.after ? JSON.stringify(params.after) : null,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
  });
}
