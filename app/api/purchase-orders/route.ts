import { getDb } from "@/db";
import { purchaseOrders } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = db.select().from(purchaseOrders).all();
  return Response.json({ purchaseOrders: rows });
}
