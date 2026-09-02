import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, documents, users } from "@/db/schema";
import { APPLICATION_REVIEW_ROLES, verifyApplicationAccessToken } from "@/lib/application-access";
import { recordAuditEvent } from "@/lib/audit";
import { getOptionalSession } from "@/lib/authz";
import { applicationAssignSchema, applicationReviewSchema, validateBody } from "@/lib/validation";

// Vista de uma candidatura: interna (Muntu, a avaliar) ou pública (o
// próprio candidato, por token — ver README secção "Como um utilizador
// real chega à plataforma"). Nunca as duas coisas ao mesmo tempo por
// engano: o token só serve a candidatura a que pertence.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [application] = await db.select().from(applications).where(eq(applications.id, id));
  if (!application) return Response.json({ error: "Candidatura não encontrada" }, { status: 404 });

  const session = getOptionalSession(request);
  const isReviewer = Boolean(session && APPLICATION_REVIEW_ROLES.includes(session.accessLevel));
  if (!isReviewer) {
    const { searchParams } = new URL(request.url);
    const validToken = await verifyApplicationAccessToken(searchParams.get("token"), id);
    if (!validToken) return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const docs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.entityType, "application"), eq(documents.entityId, id)));

  return Response.json({ application, documents: docs });
}

// Duas acções distintas partilham este PATCH, nunca no mesmo pedido:
// - mudança de estado (Avaliação -> Aprovada/Rejeitada), só Muntu
//   (coe_manager/supplier_governance). A homologação em si (que cria a
//   empresa/fornecedor/utilizador) é uma acção separada — ver
//   [id]/homologate/route.ts — porque tem efeitos que uma simples mudança
//   de estado não devia ter escondidos dentro de si.
// - atribuição de responsável (assignedToUserId), independente do estado
//   — mesmo padrão de support_tickets.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = getOptionalSession(request);
  if (!session || !APPLICATION_REVIEW_ROLES.includes(session.accessLevel)) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const { id } = await params;
  const db = getDb();
  const [existing] = await db.select().from(applications).where(eq(applications.id, id));
  if (!existing) return Response.json({ error: "Candidatura não encontrada" }, { status: 404 });

  // supplier_governance é vendor governance — só controla candidaturas de
  // fornecedor, nunca de empresa cliente (essa continua só coe_manager).
  if (session.accessLevel === "supplier_governance" && existing.kind !== "fornecedor") {
    return Response.json({ error: "Sem permissão para aceder a esta candidatura." }, { status: 403 });
  }

  const json: unknown = await request.json().catch(() => null);

  if (json && typeof json === "object" && "assignedToUserId" in json) {
    const parsed = validateBody(json, applicationAssignSchema);
    if (!parsed.success) return parsed.response;

    if (parsed.data.assignedToUserId != null) {
      const [assignee] = await db.select().from(users).where(eq(users.id, parsed.data.assignedToUserId));
      if (!assignee || !APPLICATION_REVIEW_ROLES.includes(assignee.accessLevel)) {
        return Response.json({ error: "Só é possível atribuir a um coe_manager ou supplier_governance." }, { status: 400 });
      }
    }

    const [updated] = await db
      .update(applications)
      .set({ assignedToUserId: parsed.data.assignedToUserId })
      .where(eq(applications.id, id))
      .returning();
    return Response.json({ application: updated });
  }

  if (existing.status === "homologada") {
    return Response.json({ error: "Candidatura já homologada, já não pode mudar de estado." }, { status: 400 });
  }
  const parsed = validateBody(json, applicationReviewSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const [updated] = await db
    .update(applications)
    .set({
      status: payload.status,
      rejectionReason: payload.status === "rejeitada" ? payload.rejectionReason : null,
      reviewedByUserId: session.userId,
      reviewedAt: new Date(),
    })
    .where(eq(applications.id, id))
    .returning();

  await recordAuditEvent(db, {
    actorUserId: session.userId,
    action: `application.${payload.status}`,
    entityType: "application",
    entityId: id,
    before: { status: existing.status },
    after: { status: updated.status },
  });

  return Response.json({ application: updated });
}
