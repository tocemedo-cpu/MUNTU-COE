import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { parseJsonBody, userAccessUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, userAccessUpdateSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(users).where(eq(users.id, Number(id)));
  if (!existing) return Response.json({ error: "Utilizador não encontrado" }, { status: 404 });

  const [updated] = await db
    .update(users)
    .set({
      accessLevel: parsed.data.accessLevel,
      companyId: parsed.data.companyId !== undefined ? parsed.data.companyId : existing.companyId,
      supplierId: parsed.data.supplierId !== undefined ? parsed.data.supplierId : existing.supplierId,
    })
    .where(eq(users.id, Number(id)))
    .returning();

  const { password: _password, ...safeUser } = updated;
  return Response.json({ user: safeUser });
}
