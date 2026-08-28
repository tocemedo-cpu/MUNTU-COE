import { getDb } from "@/db";
import { companies, suppliers, users } from "@/db/schema";

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(users);
  const companyRows = await db.select().from(companies);
  const supplierRows = await db.select().from(suppliers);
  const companyNameById = new Map(companyRows.map((c) => [c.id, c.name]));
  const supplierNameById = new Map(supplierRows.map((s) => [s.id, s.name]));

  return Response.json({
    users: rows.map(({ password: _password, ...user }) => ({
      ...user,
      companyName: user.companyId != null ? (companyNameById.get(user.companyId) ?? null) : null,
      supplierName: user.supplierId != null ? (supplierNameById.get(user.supplierId) ?? null) : null,
    })),
  });
}
