import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { getSession } from "@/lib/authz";
import { parseJsonBody, userAccessUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, userAccessUpdateSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(users).where(eq(users.id, Number(id)));
  if (!existing) return Response.json({ error: "Utilizador não encontrado" }, { status: 404 });

  const [updated] = await db
    .update(users)
    .set({
      accessLevel: parsed.data.accessLevel,
      companyId: parsed.data.companyId !== undefined ? parsed.data.companyId : existing.companyId,
      supplierId: parsed.data.supplierId !== undefined ? parsed.data.supplierId : existing.supplierId,
    })
    .where(eq(users.id, Number(id)))
    .returning();

  // IAM — mudar o nível de acesso de alguém é potencialmente escalar
  // privilégios, sempre registado (ver README §Personas e permissões).
  const session = getSession(request);
  await recordAuditEvent(db, {
    actorUserId: session.userId,
    action: "user.access_change",
    entityType: "user",
    entityId: id,
    before: { accessLevel: existing.accessLevel, companyId: existing.companyId, supplierId: existing.supplierId },
    after: { accessLevel: updated.accessLevel, companyId: updated.companyId, supplierId: updated.supplierId },
  });

  const { password: _password, ...safeUser } = updated;
  return Response.json({ user: safeUser });
}
