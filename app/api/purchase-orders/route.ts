import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { purchaseOrders } from "@/db/schema";
import { getSession } from "@/lib/authz";

export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  if (session.accessLevel === "supplier") {
    // Sem fornecedor ligado (ainda não atribuído pelo System Admin), o
    // âmbito fica vazio — nunca "vê tudo" por omissão.
    if (session.supplierId == null) return Response.json({ purchaseOrders: [] });
    const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.supplierId, session.supplierId));
    return Response.json({ purchaseOrders: rows });
  }

  const rows =
    session.accessLevel === "company_admin" && session.companyId != null
      ? await db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, session.companyId))
      : await db.select().from(purchaseOrders);

  return Response.json({ purchaseOrders: rows });
}
