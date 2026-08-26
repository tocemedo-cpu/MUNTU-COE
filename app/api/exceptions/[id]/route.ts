import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { exceptions } from "@/db/schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const payload = (await request.json()) as { action?: "resolve" };

  const existing = db.select().from(exceptions).where(eq(exceptions.id, id)).get();
  if (!existing) return Response.json({ error: "Excepção não encontrada" }, { status: 404 });

  if (payload.action === "resolve") {
    const [updated] = db
      .update(exceptions)
      .set({ resolved: true })
      .where(eq(exceptions.id, id))
      .returning().all();
    return Response.json({ exception: updated });
  }

  return Response.json({ error: "Acção inválida" }, { status: 400 });
}
