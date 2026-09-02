import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bids } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { forbidUnless, getSession } from "@/lib/authz";
import { bidEvaluateSchema, parseJsonBody } from "@/lib/validation";

// Avaliação técnica de uma proposta — separada da decisão comercial de
// adjudicação (POST /api/tenders/:id/award), que continua a não exigir
// esta nota para avançar (ver README §Personas e permissões). Só regista
// pontuação/notas; nunca marca vencedora/rejeitada nem toca em `status`.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; bidId: string }> }) {
  const forbidden = forbidUnless(request, ["technical_evaluator", "coe_manager"]);
  if (forbidden) return forbidden;

  const { id, bidId } = await params;
  const db = getDb();
  const [existing] = await db.select().from(bids).where(and(eq(bids.id, Number(bidId)), eq(bids.tenderId, id)));
  if (!existing) return Response.json({ error: "Proposta não encontrada para este tender." }, { status: 404 });

  const parsed = await parseJsonBody(request, bidEvaluateSchema);
  if (!parsed.success) return parsed.response;

  const session = getSession(request);
  const [updated] = await db
    .update(bids)
    .set({
      technicalScore: parsed.data.technicalScore,
      technicalNotes: parsed.data.technicalNotes ?? "",
      technicallyEvaluatedByUserId: session.userId,
      technicallyEvaluatedAt: new Date(),
    })
    .where(eq(bids.id, existing.id))
    .returning();

  await recordAuditEvent(db, {
    actorUserId: session.userId,
    action: "bid.technical_evaluation",
    entityType: "bid",
    entityId: existing.id,
    before: { technicalScore: existing.technicalScore },
    after: { technicalScore: updated.technicalScore },
  });

  return Response.json({ bid: updated });
}
