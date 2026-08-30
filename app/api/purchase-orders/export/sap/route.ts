import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { purchaseOrders } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { buildSapPurchaseOrderCsv } from "@/lib/sap-export";
import { contentDispositionHeader } from "@/lib/uploads";

/**
 * Exportação estruturada para SAP — ordens de compra de uma empresa num
 * período, em CSV. Só para quem gere a execução P2P de uma empresa
 * concreta (nunca um fornecedor, que só vê as suas próprias POs, sem
 * sentido nenhum para um mapa de importação SAP do lado do cliente).
 */
export async function GET(request: Request) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager", "system_admin"]);
  if (forbidden) return forbidden;

  const session = getSession(request);
  const { searchParams } = new URL(request.url);

  let companyId: number;
  if (session.accessLevel === "company_admin") {
    if (session.companyId == null) {
      return Response.json({ error: "A sua conta não está ligada a nenhuma empresa." }, { status: 400 });
    }
    companyId = session.companyId;
  } else {
    const companyIdParam = searchParams.get("companyId");
    if (!companyIdParam || !Number.isInteger(Number(companyIdParam))) {
      return Response.json({ error: "Indique companyId." }, { status: 400 });
    }
    companyId = Number(companyIdParam);
  }

  const periodStartParam = searchParams.get("periodStart");
  const periodEndParam = searchParams.get("periodEnd");
  if (!periodStartParam || !periodEndParam) {
    return Response.json({ error: "Indique periodStart e periodEnd (YYYY-MM-DD)." }, { status: 400 });
  }
  const periodStart = new Date(periodStartParam);
  const periodEnd = new Date(periodEndParam);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < periodStart) {
    return Response.json({ error: "Período inválido." }, { status: 400 });
  }
  // Fim do dia, para incluir POs criadas em qualquer altura do próprio periodEnd.
  const periodEndInclusive = new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000 - 1);

  const db = getDb();
  const rows = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.companyId, companyId), gte(purchaseOrders.createdAt, periodStart), lte(purchaseOrders.createdAt, periodEndInclusive)));

  if (rows.length === 0) {
    return Response.json({ error: "Não há ordens de compra neste período." }, { status: 400 });
  }

  const csv = buildSapPurchaseOrderCsv(
    rows.map((po) => ({
      companyCode: String(po.companyId),
      purchasingDocument: po.id,
      documentDate: po.createdAt,
      vendorName: po.supplier,
      shortText: po.description,
      netOrderValue: po.value,
      status: po.status,
      tier: po.tier,
    }))
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDispositionHeader(`sap-po-export-${periodStartParam}-${periodEndParam}.csv`),
    },
  });
}
