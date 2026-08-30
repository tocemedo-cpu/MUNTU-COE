import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { receipts } from "@/db/schema";
import { getSession } from "@/lib/authz";
import { parseLimit } from "@/lib/pagination";

export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);
  const limit = parseLimit(request);

  if (session.accessLevel === "supplier") {
    if (session.supplierId == null) return Response.json({ receipts: [] });
    const rows = await db
      .select()
      .from(receipts)
      .where(eq(receipts.supplierId, session.supplierId))
      .orderBy(desc(receipts.id))
      .limit(limit);
    return Response.json({ receipts: rows });
  }

  const rows =
    session.accessLevel === "company_admin" && session.companyId != null
      ? await db.select().from(receipts).where(eq(receipts.companyId, session.companyId)).orderBy(desc(receipts.id)).limit(limit)
      : await db.select().from(receipts).orderBy(desc(receipts.id)).limit(limit);

  return Response.json({ receipts: rows });
}
