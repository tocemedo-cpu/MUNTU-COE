import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentBatches } from "@/db/schema";
import { getSession } from "@/lib/authz";

export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  const rows =
    session.accessLevel === "company_admin" && session.companyId != null
      ? await db.select().from(paymentBatches).where(eq(paymentBatches.companyId, session.companyId))
      : await db.select().from(paymentBatches);

  return Response.json({ paymentBatches: rows });
}
