import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { billingRates } from "@/db/schema";
import { billingRateUpdateSchema, parseJsonBody } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const parsed = await parseJsonBody(request, billingRateUpdateSchema);
  if (!parsed.success) return parsed.response;

  const db = getDb();
  const [existing] = await db.select().from(billingRates).where(eq(billingRates.key, key));
  if (!existing) return Response.json({ error: "Tarifa não encontrada" }, { status: 404 });

  const [updated] = await db
    .update(billingRates)
    .set({ amount: parsed.data.amount, updatedAt: new Date() })
    .where(eq(billingRates.key, key))
    .returning();

  return Response.json({ billingRate: updated });
}
