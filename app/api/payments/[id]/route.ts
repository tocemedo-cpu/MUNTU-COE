import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentBatches } from "@/db/schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const payload = (await request.json()) as { action?: "release" };

  const [existing] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, id));
  if (!existing) return Response.json({ error: "Lote não encontrado" }, { status: 404 });

  if (payload.action === "release") {
    const [updated] = await db
      .update(paymentBatches)
      .set({ released: true, status: "Pago" })
      .where(eq(paymentBatches.id, id))
      .returning();
    return Response.json({ paymentBatch: updated });
  }

  return Response.json({ error: "Acção inválida" }, { status: 400 });
}
