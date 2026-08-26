import { like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const rows = q
    ? await db
        .select()
        .from(invoices)
        .where(
          or(
            like(invoices.id, `%${q}%`),
            like(invoices.supplier, `%${q}%`),
            like(invoices.po, `%${q}%`),
            like(invoices.status, `%${q}%`)
          )
        )
    : await db.select().from(invoices);

  return Response.json({ invoices: rows });
}
