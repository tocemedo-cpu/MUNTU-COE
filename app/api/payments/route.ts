import { getDb } from "@/db";
import { paymentBatches } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = db.select().from(paymentBatches).all();
  return Response.json({ paymentBatches: rows });
}
