import { like } from "drizzle-orm";
import { getDb } from "@/db";
import { suppliers } from "@/db/schema";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const rows = q
    ? await db.select().from(suppliers).where(like(suppliers.name, `%${q}%`))
    : await db.select().from(suppliers);

  return Response.json({ suppliers: rows });
}

export async function POST(request: Request) {
  const db = getDb();
  const payload = (await request.json()) as { name?: string; category?: string };

  if (!payload.name?.trim()) {
    return Response.json({ error: "O nome do fornecedor é obrigatório" }, { status: 400 });
  }

  const [created] = await db
    .insert(suppliers)
    .values({
      name: payload.name.trim(),
      category: payload.category?.trim() || "Por classificar",
      passport: 0,
      risk: "Médio",
      local: "0%",
      status: "Documentos",
    })
    .returning();

  return Response.json({ supplier: created }, { status: 201 });
}
