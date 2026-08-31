import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documentFiles, documents } from "@/db/schema";
import { APPLICATION_REVIEW_ROLES, verifyApplicationAccessToken } from "@/lib/application-access";
import { getOptionalSession } from "@/lib/authz";
import { readDocumentBytes } from "@/lib/storage";
import { contentDispositionHeader } from "@/lib/uploads";

// Download de um documento da própria candidatura — pelo candidato (token,
// sem sessão) ou por um revisor Muntu (sessão real). Mesma dualidade de
// acesso do resto de /api/applications/[id]: nunca sessão obrigatória,
// nunca token de outra candidatura a servir aqui (verificado abaixo por
// entityId, não só pela existência de um token válido qualquer).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  const { id, documentId } = await params;
  const db = getDb();

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, Number(documentId)), eq(documents.entityType, "application"), eq(documents.entityId, id)));
  if (!doc) return Response.json({ error: "Documento não encontrado" }, { status: 404 });

  const session = getOptionalSession(request);
  const isReviewer = Boolean(session && APPLICATION_REVIEW_ROLES.includes(session.accessLevel));
  if (!isReviewer) {
    const { searchParams } = new URL(request.url);
    const validToken = await verifyApplicationAccessToken(searchParams.get("token"), id);
    if (!validToken) return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const [file] = await db.select().from(documentFiles).where(eq(documentFiles.documentId, doc.id));
  if (!file) return Response.json({ error: "Ficheiro não encontrado" }, { status: 404 });

  const bytes = await readDocumentBytes(file);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.contentType || "application/octet-stream",
      "Content-Disposition": contentDispositionHeader(doc.name),
      "Content-Length": String(bytes.length),
    },
  });
}
