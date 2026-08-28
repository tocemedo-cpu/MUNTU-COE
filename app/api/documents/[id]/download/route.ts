import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documentFiles, documents } from "@/db/schema";
import { contentDispositionHeader } from "@/lib/uploads";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [doc] = await db.select().from(documents).where(eq(documents.id, Number(id)));
  if (!doc) return Response.json({ error: "Documento não encontrado" }, { status: 404 });

  const [file] = await db.select().from(documentFiles).where(eq(documentFiles.documentId, Number(id)));
  if (!file) return Response.json({ error: "Ficheiro não encontrado" }, { status: 404 });

  return new Response(new Uint8Array(file.content), {
    headers: {
      "Content-Type": doc.contentType || "application/octet-stream",
      "Content-Disposition": contentDispositionHeader(doc.name),
      "Content-Length": String(file.content.length),
    },
  });
}
