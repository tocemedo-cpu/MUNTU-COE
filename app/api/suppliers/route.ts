import { eq, like } from "drizzle-orm";
import { getDb } from "@/db";
import { suppliers } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { parseJsonBody, supplierCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  if (session.accessLevel === "supplier") {
    if (session.supplierId == null) return Response.json({ suppliers: [] });
    const rows = await db.select().from(suppliers).where(eq(suppliers.id, session.supplierId));
    return Response.json({ suppliers: rows });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const rows = q
    ? await db.select().from(suppliers).where(like(suppliers.name, `%${q}%`))
    : await db.select().from(suppliers);

  return Response.json({ suppliers: rows });
}

// Procurement/vendor governance, fora do system_admin desde o redesenho
// de RBAC (ver README §Personas e permissões).
export async function POST(request: Request) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager", "supplier_governance"]);
  if (forbidden) return forbidden;

  const db = getDb();
  const parsed = await parseJsonBody(request, supplierCreateSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const [created] = await db
    .insert(suppliers)
    .values({
      name: payload.name.trim(),
      category: payload.category?.trim() || "Por classificar",
      passport: 0,
      risk: "Médio",
      local: "0%",
      status: "Documentos",
    })
    .returning();

  return Response.json({ supplier: created }, { status: 201 });
}
