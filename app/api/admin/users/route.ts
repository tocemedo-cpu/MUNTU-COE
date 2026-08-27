import { getDb } from "@/db";
import { companies, users } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(users);
  const companyRows = await db.select().from(companies);
  const companyNameById = new Map(companyRows.map((c) => [c.id, c.name]));

  return Response.json({
    users: rows.map(({ password: _password, ...user }) => ({
      ...user,
      companyName: user.companyId != null ? (companyNameById.get(user.companyId) ?? null) : null,
    })),
  });
}
