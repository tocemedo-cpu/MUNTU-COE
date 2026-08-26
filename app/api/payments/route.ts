import { getDb } from "@/db";
import { paymentBatches } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(paymentBatches);
  return Response.json({ paymentBatches: rows });
}
