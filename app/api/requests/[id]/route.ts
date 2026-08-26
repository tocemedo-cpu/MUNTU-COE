import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { requests } from "@/db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(requests).where(eq(requests.id, id));
  if (!row) return Response.json({ error: "Pedido não encontrado" }, { status: 404 });
  return Response.json({ request: row });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const payload = (await request.json()) as { action?: "approve" | "reject" };

  const [existing] = await db.select().from(requests).where(eq(requests.id, id));
  if (!existing) return Response.json({ error: "Pedido não encontrado" }, { status: 404 });

  const approve = payload.action === "approve";
  const [updated] = await db
    .update(requests)
    .set({
      status: approve ? "Em execução" : "Rejeitado",
      stage: approve ? Math.max(existing.stage, 3) : existing.stage,
      sla: approve ? "Dentro do SLA" : "Encerrado",
    })
    .where(eq(requests.id, id))
    .returning();

  return Response.json({ request: updated });
}
