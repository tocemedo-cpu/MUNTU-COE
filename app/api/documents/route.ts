import { and, eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { documentFiles, documents, users } from "@/db/schema";
import { getSession } from "@/lib/authz";
import { canAccessDocumentEntity, isDocumentEntityType } from "@/lib/document-access";
import { formatPtDateTime } from "@/lib/format";
import { validateUploadedFile } from "@/lib/uploads";

// Sem middleware.ts a restringir este prefixo (ao contrário da listagem
// geral, que continua reservada a company_admin/analyst/coe_manager/
// system_admin, verificado aqui à mão) — um requisitante/fornecedor
// precisa de conseguir aceder aos documentos ligados ao seu próprio
// pedido/fornecedor, e a autorização real por entidade
// (canAccessDocumentEntity) é quem decide, não o nível de acesso sozinho.
const GENERAL_LIST_ROLES = ["company_admin", "analyst", "coe_manager", "system_admin"];

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const entityType = searchParams.get("entityType")?.trim();
  const entityId = searchParams.get("entityId")?.trim();
  const session = getSession(request);

  if (entityType && entityId) {
    if (!isDocumentEntityType(entityType)) {
      return Response.json({ error: "Tipo de entidade desconhecido" }, { status: 400 });
    }
    const allowed = await canAccessDocumentEntity(db, session, entityType, entityId);
    if (!allowed) {
      return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
    }
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.entityType, entityType), eq(documents.entityId, entityId)));
    return Response.json({ documents: rows });
  }

  // Listagem geral (Repositório) — sem entidade específica, continua
  // restrita como sempre esteve, agora verificado no handler em vez do
  // middleware.
  if (!GENERAL_LIST_ROLES.includes(session.accessLevel)) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

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
  const session = getSession(request);

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

  const entityType = String(form.get("entityType") ?? "").trim() || null;
  const entityId = String(form.get("entityId") ?? "").trim() || null;

  if (entityType && entityId) {
    if (!isDocumentEntityType(entityType)) {
      return Response.json({ error: "Tipo de entidade desconhecido" }, { status: 400 });
    }
    const allowed = await canAccessDocumentEntity(db, session, entityType, entityId);
    if (!allowed) {
      return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
    }
  } else if (!GENERAL_LIST_ROLES.includes(session.accessLevel)) {
    // Upload geral para o Repositório, sem entidade — mesma restrição de
    // sempre.
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const type = String(form.get("type") ?? "").trim() || "Documento";
  const requestRef = String(form.get("request") ?? "").trim() || "—";

  const [currentUser] = await db.select().from(users).where(eq(users.id, session.userId));
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
        updated: formatPtDateTime(new Date()),
        contentType: file.type || null,
        size: bytes.length,
        entityType,
        entityId,
      })
      .returning();
    await tx.insert(documentFiles).values({ documentId: row.id, content: bytes });
    return row;
  });

  return Response.json({ document: created }, { status: 201 });
}
