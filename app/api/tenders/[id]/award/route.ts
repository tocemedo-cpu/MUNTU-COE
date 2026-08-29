import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { bids, purchaseOrders, suppliers, tenders } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { isUniqueViolation } from "@/lib/db-errors";
import { checkSupplierRiskBlock } from "@/lib/risk-block";
import { parseJsonBody, tenderAwardSchema } from "@/lib/validation";

// Adjudica uma proposta: marca-a vencedora, rejeita as restantes, fecha o
// tender e gera a PO — tudo numa transacção, porque um tender adjudicado
// sem PO (ou uma PO sem tender fechado) deixaria o estado inconsistente.
// Tier fixo em "complexo": uma RFQ concorrencial já implica mais esforço
// da Muntu do que uma PO standard assistida (não há "Tipo de transacção"
// nenhum para classificar, ao contrário de um pedido normal).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager", "system_admin"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const [tender] = await db.select().from(tenders).where(eq(tenders.id, id));
  if (!tender) return Response.json({ error: "Tender não encontrado" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel === "company_admin" && session.companyId !== tender.companyId) {
    return Response.json({ error: "Sem permissão para aceder a este tender." }, { status: 403 });
  }
  if (tender.status !== "aberto") {
    return Response.json({ error: "Este tender já não está aberto." }, { status: 400 });
  }

  const parsed = await parseJsonBody(request, tenderAwardSchema);
  if (!parsed.success) return parsed.response;

  const [winningBid] = await db.select().from(bids).where(and(eq(bids.id, parsed.data.bidId), eq(bids.tenderId, id)));
  if (!winningBid) return Response.json({ error: "Proposta não encontrada para este tender." }, { status: 400 });

  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, winningBid.supplierId));
  if (!supplier) return Response.json({ error: "Fornecedor da proposta não encontrado." }, { status: 400 });

  // Mesmo bloqueio por risco alto do que a aprovação de um pedido — ver
  // lib/risk-block.ts.
  const riskCheck = checkSupplierRiskBlock({ risk: supplier.risk, accessLevel: session.accessLevel, overrideRisk: parsed.data.overrideRisk });
  if (riskCheck.blocked) {
    return Response.json({ error: riskCheck.reason, riskBlock: true, canOverride: riskCheck.canOverride }, { status: 409 });
  }
  const riskOverriddenByUserId = parsed.data.overrideRisk ? session.userId : null;

  const result = await db.transaction(async (tx) => {
    await tx.update(bids).set({ status: "vencedora" }).where(eq(bids.id, winningBid.id));
    await tx
      .update(bids)
      .set({ status: "rejeitada" })
      .where(and(eq(bids.tenderId, id), ne(bids.id, winningBid.id)));

    let po: typeof purchaseOrders.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const poId = `PO-${6_100_000 + Math.floor(Math.random() * 900_000)}`;
      try {
        [po] = await tx
          .insert(purchaseOrders)
          .values({
            id: poId,
            supplier: supplier.name,
            description: tender.title,
            value: winningBid.value,
            status: "Confirmado",
            nextAction: "Expediting",
            requestId: tender.requestId,
            companyId: tender.companyId,
            supplierId: supplier.id,
            tier: "complexo",
            riskOverriddenByUserId,
            riskOverriddenAt: riskOverriddenByUserId ? new Date() : null,
          })
          .returning();
        break;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 4) throw error;
      }
    }
    if (!po) throw new Error("Não foi possível gerar um id de PO único");

    const [updatedTender] = await tx
      .update(tenders)
      .set({ status: "adjudicado", awardedBidId: winningBid.id, awardedPoId: po.id })
      .where(eq(tenders.id, id))
      .returning();

    return { tender: updatedTender, po };
  });

  return Response.json(result, { status: 201 });
}
