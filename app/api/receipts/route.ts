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

  // consignee é escopado à própria empresa, mesma regra de company_admin —
  // sem isto, caía no "senão" abaixo e via recepções de todas as empresas.
  const isCompanyScoped = session.accessLevel === "company_admin" || session.accessLevel === "consignee";
  const rows =
    isCompanyScoped && session.companyId != null
      ? await db.select().from(receipts).where(eq(receipts.companyId, session.companyId)).orderBy(desc(receipts.id)).limit(limit)
      : isCompanyScoped
        ? []
        : await db.select().from(receipts).orderBy(desc(receipts.id)).limit(limit);

  return Response.json({ receipts: rows });
}
