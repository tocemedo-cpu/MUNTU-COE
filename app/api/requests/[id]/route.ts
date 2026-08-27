import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { purchaseOrders, requests } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { classifyPoTier } from "@/lib/billing";
import { parseJsonBody, requestActionSchema } from "@/lib/validation";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(requests).where(eq(requests.id, id));
  if (!row) return Response.json({ error: "Pedido não encontrado" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel === "requester" && row.ownerUserId !== session.userId) {
    return Response.json({ error: "Sem permissão para aceder a este pedido." }, { status: 403 });
  }

  return Response.json({ request: row });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["company_admin", "coe_manager", "system_admin"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, requestActionSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(requests).where(eq(requests.id, id));
  if (!existing) return Response.json({ error: "Pedido não encontrado" }, { status: 404 });

  const approve = parsed.data.action === "approve";
  const [updated] = await db
    .update(requests)
    .set({
      status: approve ? "Em execução" : "Rejeitado",
      stage: approve ? Math.max(existing.stage, 3) : existing.stage,
      sla: approve ? "Dentro do SLA" : "Encerrado",
    })
    .where(eq(requests.id, id))
    .returning();

  // Aprovar gera a PO ligada ao pedido — é isto que alimenta a execução
  // P2P (e, mais tarde, a facturação de actividade) com dados reais em
  // vez de datasets paralelos sem ligação nenhuma ao pedido de origem.
  if (approve) {
    const [existingPo] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.requestId, id));
    if (!existingPo) {
      const poCount = (await db.select().from(purchaseOrders)).length;
      await db.insert(purchaseOrders).values({
        id: `PO-${6100400 + poCount}`,
        supplier: existing.supplier,
        description: existing.subject,
        value: existing.value,
        status: "Confirmado",
        nextAction: "Expediting",
        requestId: existing.id,
        companyId: existing.companyId,
        tier: classifyPoTier(existing.type),
      });
    }
  }

  return Response.json({ request: updated });
}
