import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { exceptions, paymentBatches, purchaseOrders, suppliers } from "@/db/schema";

/**
 * Libertação automática de pagamento — pensada para ser chamada
 * periodicamente por um agendador externo (mesmo padrão de
 * /api/admin/billing/generate-monthly e /api/admin/sla-alerts/run):
 * isenta do middleware de sessão, autenticada só pelo próprio
 * CRON_SECRET. Sem CRON_SECRET definido, recusa sempre.
 *
 * Um lote de pagamento (`payment_batches`, ainda por libertar) só é
 * libertado sozinho quando a empresa dele não tem nenhum sinal real de
 * problema por resolver:
 *   - nenhuma excepção aberta (`exceptions.resolved = false`);
 *   - nenhuma PO gerada para um fornecedor de risco "Alto" sem override
 *     registado (`purchase_orders.risk_overridden_by_user_id` nulo — ver
 *     lib/risk-block.ts, que bloqueia a origem dessa PO por omissão).
 * Havendo qualquer um dos dois, o lote fica como estava — só a
 * libertação manual (PATCH /api/payments/:id) continua disponível,
 * porque decidir libertar apesar do problema é uma decisão humana.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET não está configurado no servidor." }, { status: 501 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();

  const pendingBatches = await db.select().from(paymentBatches).where(eq(paymentBatches.released, false));

  const summary = { released: 0, blockedByExceptions: 0, blockedByRisk: 0 };

  for (const batch of pendingBatches) {
    if (batch.companyId == null) continue;

    const openExceptions = await db
      .select()
      .from(exceptions)
      .where(and(eq(exceptions.companyId, batch.companyId), eq(exceptions.resolved, false)));
    if (openExceptions.length > 0) {
      summary.blockedByExceptions += 1;
      continue;
    }

    const unresolvedRiskPos = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(and(eq(purchaseOrders.companyId, batch.companyId), eq(suppliers.risk, "Alto"), isNull(purchaseOrders.riskOverriddenByUserId)));
    if (unresolvedRiskPos.length > 0) {
      summary.blockedByRisk += 1;
      continue;
    }

    await db.update(paymentBatches).set({ released: true, status: "Pago", autoReleasedAt: now }).where(eq(paymentBatches.id, batch.id));
    summary.released += 1;
  }

  return Response.json(summary);
}
