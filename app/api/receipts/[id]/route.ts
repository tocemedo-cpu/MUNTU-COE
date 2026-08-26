import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { receipts } from "@/db/schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const payload = (await request.json()) as { action?: "confirm" };

  const [existing] = await db.select().from(receipts).where(eq(receipts.id, Number(id)));
  if (!existing) return Response.json({ error: "Recepção não encontrada" }, { status: 404 });

  if (payload.action === "confirm") {
    const [updated] = await db
      .update(receipts)
      .set({ progress: 100, status: "Confirmada" })
      .where(eq(receipts.id, Number(id)))
      .returning();
    return Response.json({ receipt: updated });
  }

  return Response.json({ error: "Acção inválida" }, { status: 400 });
}
