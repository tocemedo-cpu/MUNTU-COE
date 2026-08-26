import { getDb } from "@/db";
import { receipts } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(receipts);
  return Response.json({ receipts: rows });
}
