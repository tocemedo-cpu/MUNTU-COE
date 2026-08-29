import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, documents } from "@/db/schema";
import { APPLICATION_REVIEW_ROLES, verifyApplicationAccessToken } from "@/lib/application-access";
import { getOptionalSession } from "@/lib/authz";
import { applicationReviewSchema, parseJsonBody } from "@/lib/validation";

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

// Transições de estado — só a Muntu (coe_manager/system_admin) avalia
// (Avaliação -> Aprovada/Rejeitada). A homologação em si (que cria a
// empresa/fornecedor/utilizador) é uma acção separada — ver
// [id]/homologate/route.ts — porque tem efeitos que uma simples mudança de
// estado não devia ter escondidos dentro de si.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = getOptionalSession(request);
  if (!session || !APPLICATION_REVIEW_ROLES.includes(session.accessLevel)) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const { id } = await params;
  const parsed = await parseJsonBody(request, applicationReviewSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  const [existing] = await db.select().from(applications).where(eq(applications.id, id));
  if (!existing) return Response.json({ error: "Candidatura não encontrada" }, { status: 404 });
  if (existing.status === "homologada") {
    return Response.json({ error: "Candidatura já homologada, já não pode mudar de estado." }, { status: 400 });
  }

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

  return Response.json({ application: updated });
}
