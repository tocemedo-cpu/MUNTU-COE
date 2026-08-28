import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { companyRetainerUpdateSchema, parseJsonBody } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseJsonBody(request, companyRetainerUpdateSchema);
  if (!parsed.success) return parsed.response;

  const db = getDb();
  const [existing] = await db.select().from(companies).where(eq(companies.id, Number(id)));
  if (!existing) return Response.json({ error: "Empresa não encontrada" }, { status: 404 });

  const [updated] = await db
    .update(companies)
    .set({ retainerAmount: parsed.data.retainerAmount })
    .where(eq(companies.id, Number(id)))
    .returning();

  const { ssoClientSecret: _secret, ...company } = updated;
  return Response.json({ company });
}
