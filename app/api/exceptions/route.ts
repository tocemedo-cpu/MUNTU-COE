import { getDb } from "@/db";
import { exceptions } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = db.select().from(exceptions).all();
  return Response.json({ exceptions: rows });
}
