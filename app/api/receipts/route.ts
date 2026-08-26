import { getDb } from "@/db";
import { receipts } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = db.select().from(receipts).all();
  return Response.json({ receipts: rows });
}
