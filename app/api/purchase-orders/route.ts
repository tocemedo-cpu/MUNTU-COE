import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { purchaseOrders } from "@/db/schema";
import { getSession } from "@/lib/authz";

export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  const rows =
    session.accessLevel === "company_admin" && session.companyId != null
      ? await db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, session.companyId))
      : await db.select().from(purchaseOrders);

  return Response.json({ purchaseOrders: rows });
}
