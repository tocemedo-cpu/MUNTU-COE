import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { companyUpdateSchema, parseJsonBody } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseJsonBody(request, companyUpdateSchema);
  if (!parsed.success) return parsed.response;

  const db = getDb();
  const [existing] = await db.select().from(companies).where(eq(companies.id, Number(id)));
  if (!existing) return Response.json({ error: "Empresa não encontrada" }, { status: 404 });

  const updates: Partial<typeof companies.$inferInsert> = {};
  if (parsed.data.retainerAmount !== undefined) updates.retainerAmount = parsed.data.retainerAmount;
  if (parsed.data.authMethod !== undefined) updates.authMethod = parsed.data.authMethod;
  if (parsed.data.ssoIssuerUrl !== undefined) updates.ssoIssuerUrl = parsed.data.ssoIssuerUrl || null;
  if (parsed.data.ssoClientId !== undefined) updates.ssoClientId = parsed.data.ssoClientId || null;
  if (parsed.data.ssoClientSecret) updates.ssoClientSecret = parsed.data.ssoClientSecret;
  if (parsed.data.iban !== undefined) updates.iban = parsed.data.iban || null;
  if (parsed.data.bic !== undefined) updates.bic = parsed.data.bic || null;
  if (parsed.data.taxId !== undefined) updates.taxId = parsed.data.taxId || null;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  const [updated] = await db.update(companies).set(updates).where(eq(companies.id, Number(id))).returning();
  const { ssoClientSecret, ...company } = updated;
  return Response.json({ company: { ...company, hasSsoClientSecret: Boolean(ssoClientSecret) } });
}
