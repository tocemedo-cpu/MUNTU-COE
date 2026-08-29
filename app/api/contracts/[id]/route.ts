import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contracts } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { contractActionSchema, parseJsonBody } from "@/lib/validation";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!row) return Response.json({ error: "Contrato não encontrado" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel === "supplier" && row.supplierId !== session.supplierId) {
    return Response.json({ error: "Sem permissão para aceder a este contrato." }, { status: 403 });
  }
  if (session.accessLevel === "company_admin" && row.companyId !== session.companyId) {
    return Response.json({ error: "Sem permissão para aceder a este contrato." }, { status: 403 });
  }

  return Response.json({ contract: row });
}

// Única transição suportada é terminar antecipadamente — a expiração em
// si nunca é uma transição gravada, é sempre calculada a partir de
// end_date (ver comentário em db/schema.ts).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager", "system_admin"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, contractActionSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!existing) return Response.json({ error: "Contrato não encontrado" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel === "company_admin" && existing.companyId !== session.companyId) {
    return Response.json({ error: "Sem permissão para aceder a este contrato." }, { status: 403 });
  }
  if (existing.status !== "activo") {
    return Response.json({ error: "Este contrato já não está activo." }, { status: 400 });
  }

  const [updated] = await db.update(contracts).set({ status: "terminado" }).where(eq(contracts.id, id)).returning();
  return Response.json({ contract: updated });
}
