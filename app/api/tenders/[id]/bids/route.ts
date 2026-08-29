import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bids, tenderInvites, tenders } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { bidCreateSchema, parseJsonBody } from "@/lib/validation";

// Um fornecedor só pode propor a um tender aberto ao qual foi convidado, e
// só pode ter uma proposta por tender (índice único tender+fornecedor) —
// reenviar substitui a proposta anterior em vez de criar uma segunda linha,
// para o fornecedor poder corrigir um valor antes do prazo sem ajuda da
// Muntu.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["supplier"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const session = getSession(request);
  if (session.supplierId == null) {
    return Response.json({ error: "A sua conta não está ligada a nenhum fornecedor." }, { status: 400 });
  }

  const db = getDb();
  const [tender] = await db.select().from(tenders).where(eq(tenders.id, id));
  if (!tender) return Response.json({ error: "Tender não encontrado" }, { status: 404 });
  if (tender.status !== "aberto") {
    return Response.json({ error: "Este tender já não está aberto a propostas." }, { status: 400 });
  }
  if (new Date() > tender.deadline) {
    return Response.json({ error: "O prazo para propostas já terminou." }, { status: 400 });
  }

  const [invite] = await db
    .select()
    .from(tenderInvites)
    .where(and(eq(tenderInvites.tenderId, id), eq(tenderInvites.supplierId, session.supplierId)));
  if (!invite) return Response.json({ error: "Não foi convidado para este tender." }, { status: 403 });

  const parsed = await parseJsonBody(request, bidCreateSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const [bid] = await db
    .insert(bids)
    .values({
      tenderId: id,
      supplierId: session.supplierId,
      value: payload.value,
      notes: payload.notes?.trim() || "",
      status: "submetida",
    })
    .onConflictDoUpdate({
      target: [bids.tenderId, bids.supplierId],
      set: { value: payload.value, notes: payload.notes?.trim() || "", submittedAt: new Date() },
    })
    .returning();

  return Response.json({ bid }, { status: 201 });
}
