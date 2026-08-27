import { eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, users } from "@/db/schema";
import { documentCreateSchema, parseJsonBody } from "@/lib/validation";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const rows = q
    ? await db
        .select()
        .from(documents)
        .where(
          or(
            like(documents.name, `%${q}%`),
            like(documents.type, `%${q}%`),
            like(documents.request, `%${q}%`),
            like(documents.owner, `%${q}%`)
          )
        )
    : await db.select().from(documents);

  return Response.json({ documents: rows });
}

export async function POST(request: Request) {
  const db = getDb();
  const parsed = await parseJsonBody(request, documentCreateSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const userId = Number(request.headers.get("x-muntu-user-id"));
  const [currentUser] = await db.select().from(users).where(eq(users.id, userId));

  const [created] = await db
    .insert(documents)
    .values({
      name: payload.name.trim(),
      type: payload.type?.trim() || "Documento",
      request: payload.request?.trim() || "—",
      owner: currentUser?.name ?? "Desconhecido",
      version: "v1",
      updated: "Agora",
    })
    .returning();

  return Response.json({ document: created }, { status: 201 });
}
