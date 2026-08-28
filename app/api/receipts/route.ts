import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { receipts } from "@/db/schema";
import { getSession } from "@/lib/authz";

export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  if (session.accessLevel === "supplier") {
    if (session.supplierId == null) return Response.json({ receipts: [] });
    const rows = await db.select().from(receipts).where(eq(receipts.supplierId, session.supplierId));
    return Response.json({ receipts: rows });
  }

  const rows =
    session.accessLevel === "company_admin" && session.companyId != null
      ? await db.select().from(receipts).where(eq(receipts.companyId, session.companyId))
      : await db.select().from(receipts);

  return Response.json({ receipts: rows });
}
