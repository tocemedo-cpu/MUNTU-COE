import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, documentFiles, documents } from "@/db/schema";
import { verifyApplicationAccessToken } from "@/lib/application-access";
import { formatPtDateTime } from "@/lib/format";
import { validateUploadedFile } from "@/lib/uploads";

// Upload de documento pelo próprio candidato (Candidatura -> Documentos),
// que ainda não tem conta nenhuma — autorizado só pelo token da
// candidatura, nunca por sessão. A Muntu, a rever, usa a rota geral
// GET /api/documents?entityType=application&entityId=... (coberta pelo
// bypass de coe_manager/system_admin em lib/document-access.ts).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [application] = await db.select().from(applications).where(eq(applications.id, id));
  if (!application) return Response.json({ error: "Candidatura não encontrada" }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Envie o ficheiro como multipart/form-data" }, { status: 400 });
  }

  const token = String(form.get("token") ?? "").trim();
  const validToken = await verifyApplicationAccessToken(token, id);
  if (!validToken) return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Nenhum ficheiro enviado" }, { status: 400 });
  }
  const validation = validateUploadedFile({ name: file.name, size: file.size });
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const type = String(form.get("type") ?? "").trim() || "Documento de candidatura";
  const bytes = Buffer.from(await file.arrayBuffer());

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(documents)
      .values({
        name: file.name,
        type,
        request: id,
        owner: application.contactName,
        version: "v1",
        updated: formatPtDateTime(new Date()),
        contentType: file.type || null,
        size: bytes.length,
        entityType: "application",
        entityId: id,
      })
      .returning();
    await tx.insert(documentFiles).values({ documentId: row.id, content: bytes });
    return row;
  });

  return Response.json({ document: created }, { status: 201 });
}
