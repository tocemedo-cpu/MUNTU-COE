import { getDb } from "@/db";
import { companies } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(companies);
  return Response.json({ companies: rows.map(({ ssoClientSecret: _secret, ...company }) => company) });
}
