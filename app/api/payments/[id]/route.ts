import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentBatches } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { forbidUnless, getSession } from "@/lib/authz";
import { parseJsonBody, paymentActionSchema } from "@/lib/validation";

// Libertação de pagamento — financeiro, fora do system_admin desde o
// redesenho de RBAC (ver README §Personas e permissões); finance_ap é o
// papel dedicado, separado de quem só executa procurement (analyst).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager", "finance_ap"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, paymentActionSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, id));
  if (!existing) return Response.json({ error: "Lote não encontrado" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel === "company_admin" && existing.companyId !== session.companyId) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const [updated] = await db
    .update(paymentBatches)
    .set({ released: true, status: "Pago", releasedByUserId: session.userId })
    .where(eq(paymentBatches.id, id))
    .returning();

  await recordAuditEvent(db, {
    actorUserId: session.userId,
    action: "payment.release",
    entityType: "payment_batch",
    entityId: id,
    before: { status: existing.status, released: existing.released },
    after: { status: updated.status, released: updated.released },
  });

  return Response.json({ paymentBatch: updated });
}
