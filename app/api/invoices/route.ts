import { and, eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { getSession } from "@/lib/authz";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const session = getSession(request);

  if (session.accessLevel === "supplier") {
    if (session.supplierId == null) return Response.json({ invoices: [] });
    const rows = await db.select().from(invoices).where(eq(invoices.supplierId, session.supplierId));
    return Response.json({ invoices: rows });
  }

  const conditions = [];
  if (session.accessLevel === "company_admin" && session.companyId != null) {
    conditions.push(eq(invoices.companyId, session.companyId));
  }
  if (q) {
    conditions.push(
      or(
        like(invoices.id, `%${q}%`),
        like(invoices.supplier, `%${q}%`),
        like(invoices.po, `%${q}%`),
        like(invoices.status, `%${q}%`)
      )
    );
  }

  const rows = await db
    .select()
    .from(invoices)
    .where(conditions.length ? and(...conditions) : undefined);

  return Response.json({ invoices: rows });
}
