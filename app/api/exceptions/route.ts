import { getDb } from "@/db";
import { exceptions } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(exceptions);
  return Response.json({ exceptions: rows });
}
