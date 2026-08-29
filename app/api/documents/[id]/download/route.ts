import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documentFiles, documents } from "@/db/schema";
import { getSession } from "@/lib/authz";
import { canAccessDocumentEntity } from "@/lib/document-access";
import { contentDispositionHeader } from "@/lib/uploads";

const GENERAL_LIST_ROLES = ["company_admin", "analyst", "coe_manager", "system_admin"];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const session = getSession(request);

  const [doc] = await db.select().from(documents).where(eq(documents.id, Number(id)));
  if (!doc) return Response.json({ error: "Documento não encontrado" }, { status: 404 });

  // Mesma autorização por entidade da listagem (GET /api/documents) — um
  // documento ligado a um pedido/fornecedor/etc. só é descarregável por
  // quem tem acesso a essa entidade; um upload geral do Repositório
  // (entityType nulo) continua restrito aos mesmos 4 níveis de sempre.
  const allowed =
    doc.entityType && doc.entityId
      ? await canAccessDocumentEntity(db, session, doc.entityType, doc.entityId)
      : GENERAL_LIST_ROLES.includes(session.accessLevel);
  if (!allowed) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

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
