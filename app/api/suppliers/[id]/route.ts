import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suppliers } from "@/db/schema";
import { getSession } from "@/lib/authz";
import { parseJsonBody, supplierSelfUpdateSchema, supplierUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(request);
  const supplierId = Number(id);

  const isInternal = ["company_admin", "analyst", "coe_manager", "system_admin"].includes(session.accessLevel);
  const isOwnProfile = session.accessLevel === "supplier" && session.supplierId === supplierId;

  if (!isInternal && !isOwnProfile) {
    return Response.json({ error: "Sem permissão para editar este fornecedor." }, { status: 403 });
  }

  const db = getDb();
  const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
  if (!existing) return Response.json({ error: "Fornecedor não encontrado" }, { status: 404 });

  const parsed = await parseJsonBody(request, isInternal ? supplierUpdateSchema : supplierSelfUpdateSchema);
  if (!parsed.success) return parsed.response;

  const [updated] = await db.update(suppliers).set(parsed.data).where(eq(suppliers.id, supplierId)).returning();
  return Response.json({ supplier: updated });
}
