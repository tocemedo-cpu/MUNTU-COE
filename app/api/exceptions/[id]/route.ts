import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { exceptions } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { exceptionActionSchema, parseJsonBody } from "@/lib/validation";

// Procurement, fora do system_admin desde o redesenho de RBAC (ver README
// §Personas e permissões).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, exceptionActionSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(exceptions).where(eq(exceptions.id, id));
  if (!existing) return Response.json({ error: "Excepção não encontrada" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel === "company_admin" && existing.companyId !== session.companyId) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const [updated] = await db.update(exceptions).set({ resolved: true }).where(eq(exceptions.id, id)).returning();

  return Response.json({ exception: updated });
}
