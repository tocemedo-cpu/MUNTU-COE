import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { purchaseOrders, receipts } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { recordPoEvent } from "@/lib/po-events";
import { parseJsonBody, receiptActionSchema } from "@/lib/validation";

// Procurement, fora do system_admin desde o redesenho de RBAC (ver README
// §Personas e permissões); consignee entra para confirmar a recepção
// (GRN) na própria empresa.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager", "supplier", "consignee"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, receiptActionSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(receipts).where(eq(receipts.id, Number(id)));
  if (!existing) return Response.json({ error: "Recepção não encontrada" }, { status: 404 });

  const session = getSession(request);
  if ((session.accessLevel === "company_admin" || session.accessLevel === "consignee") && existing.companyId !== session.companyId) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }
  if (session.accessLevel === "supplier" && existing.supplierId !== session.supplierId) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const [updated] = await db
    .update(receipts)
    .set({ progress: 100, status: "Confirmada" })
    .where(eq(receipts.id, Number(id)))
    .returning();

  // "po" na recepção é texto livre, sem FK — só regista o evento se
  // corresponder mesmo a uma PO real (uma recepção sem PO ligada, ex.:
  // dados semeados soltos, não deve gerar um evento órfão).
  const [linkedPo] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, existing.po));
  if (linkedPo) {
    await recordPoEvent(db, {
      poId: linkedPo.id,
      type: "confirmada",
      description: `Recepção #${existing.id} confirmada — ${existing.description}`,
      userId: session.userId,
    });
  }

  return Response.json({ receipt: updated });
}
