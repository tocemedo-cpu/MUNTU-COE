import { getDb } from "@/db";
import { purchaseOrders } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(purchaseOrders);
  return Response.json({ purchaseOrders: rows });
}
