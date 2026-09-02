import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogItems } from "@/db/schema";
import { forbidUnless } from "@/lib/authz";
import { catalogItemUpdateSchema, parseJsonBody } from "@/lib/validation";

// Actualização parcial (incluindo activar/desactivar) — só quem cura o
// catálogo, mesma regra do POST.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["analyst", "coe_manager"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, catalogItemUpdateSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.id, id));
  if (!existing) return Response.json({ error: "Item de catálogo não encontrado" }, { status: 404 });

  const [updated] = await db
    .update(catalogItems)
    .set({
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
      ...(payload.category !== undefined ? { category: payload.category.trim() } : {}),
      ...(payload.unitPrice !== undefined ? { unitPrice: payload.unitPrice } : {}),
      ...(payload.unit !== undefined ? { unit: payload.unit.trim() } : {}),
      ...(payload.active !== undefined ? { active: payload.active } : {}),
    })
    .where(eq(catalogItems.id, id))
    .returning();

  return Response.json({ item: updated });
}
