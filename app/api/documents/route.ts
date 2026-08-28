import { eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { documentFiles, documents, users } from "@/db/schema";
import { validateUploadedFile } from "@/lib/uploads";

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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Envie o ficheiro como multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Nenhum ficheiro enviado" }, { status: 400 });
  }
  const validation = validateUploadedFile({ name: file.name, size: file.size });
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const type = String(form.get("type") ?? "").trim() || "Documento";
  const requestRef = String(form.get("request") ?? "").trim() || "—";

  const userId = Number(request.headers.get("x-muntu-user-id"));
  const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
  const bytes = Buffer.from(await file.arrayBuffer());

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(documents)
      .values({
        name: file.name,
        type,
        request: requestRef,
        owner: currentUser?.name ?? "Desconhecido",
        version: "v1",
        updated: "Agora",
        contentType: file.type || null,
        size: bytes.length,
      })
      .returning();
    await tx.insert(documentFiles).values({ documentId: row.id, content: bytes });
    return row;
  });

  return Response.json({ document: created }, { status: 201 });
}
