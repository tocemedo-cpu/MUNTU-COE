import { getDb } from "@/db";
import { billingRates } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(billingRates).orderBy(billingRates.key);
  return Response.json({ billingRates: rows });
}
