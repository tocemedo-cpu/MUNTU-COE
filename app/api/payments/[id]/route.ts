import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentBatches } from "@/db/schema";
import { parseJsonBody, paymentActionSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, paymentActionSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, id));
  if (!existing) return Response.json({ error: "Lote não encontrado" }, { status: 404 });

  const [updated] = await db
    .update(paymentBatches)
    .set({ released: true, status: "Pago" })
    .where(eq(paymentBatches.id, id))
    .returning();

  return Response.json({ paymentBatch: updated });
}
