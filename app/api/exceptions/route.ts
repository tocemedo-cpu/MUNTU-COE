import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { exceptions } from "@/db/schema";
import { getSession } from "@/lib/authz";

export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  const rows =
    session.accessLevel === "company_admin" && session.companyId != null
      ? await db.select().from(exceptions).where(eq(exceptions.companyId, session.companyId))
      : await db.select().from(exceptions);

  return Response.json({ exceptions: rows });
}
