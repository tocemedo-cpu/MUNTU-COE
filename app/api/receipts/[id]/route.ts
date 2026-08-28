import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { receipts } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { parseJsonBody, receiptActionSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, receiptActionSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(receipts).where(eq(receipts.id, Number(id)));
  if (!existing) return Response.json({ error: "Recepção não encontrada" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel === "company_admin" && existing.companyId !== session.companyId) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }
  if (session.accessLevel === "supplier" && existing.supplierId !== session.supplierId) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const [updated] = await db
    .update(receipts)
    .set({ progress: 100, status: "Confirmada" })
    .where(eq(receipts.id, Number(id)))
    .returning();

  return Response.json({ receipt: updated });
}
