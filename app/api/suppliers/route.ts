import { like } from "drizzle-orm";
import { getDb } from "@/db";
import { suppliers } from "@/db/schema";
import { forbidUnless } from "@/lib/authz";
import { parseJsonBody, supplierCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const rows = q
    ? await db.select().from(suppliers).where(like(suppliers.name, `%${q}%`))
    : await db.select().from(suppliers);

  return Response.json({ suppliers: rows });
}

export async function POST(request: Request) {
  const forbidden = forbidUnless(request, ["company_admin", "muntu_ops"]);
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
