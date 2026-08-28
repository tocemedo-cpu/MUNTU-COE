import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supportMessages, supportTickets, users } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { parseJsonBody, supportTicketUpdateSchema } from "@/lib/validation";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
  if (!ticket) return Response.json({ error: "Pedido de suporte não encontrado" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel !== "system_admin" && ticket.userId !== session.userId) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const messageRows = await db
    .select({
      id: supportMessages.id,
      ticketId: supportMessages.ticketId,
      body: supportMessages.body,
      createdAt: supportMessages.createdAt,
      authorUserId: supportMessages.authorUserId,
      authorName: users.name,
    })
    .from(supportMessages)
    .leftJoin(users, eq(supportMessages.authorUserId, users.id))
    .where(eq(supportMessages.ticketId, id))
    .orderBy(asc(supportMessages.createdAt));

  return Response.json({ ticket, messages: messageRows });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["system_admin"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const parsed = await parseJsonBody(request, supportTicketUpdateSchema);
  if (!parsed.success) return parsed.response;

  const db = getDb();
  const [existing] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
  if (!existing) return Response.json({ error: "Pedido de suporte não encontrado" }, { status: 404 });

  const updates: Partial<typeof supportTickets.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    updates.resolvedAt = parsed.data.status === "resolvido" || parsed.data.status === "fechado" ? new Date() : null;
  }
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.category !== undefined) updates.category = parsed.data.category;
  if (parsed.data.assignedToUserId !== undefined) updates.assignedToUserId = parsed.data.assignedToUserId;

  const [updated] = await db.update(supportTickets).set(updates).where(eq(supportTickets.id, id)).returning();
  return Response.json({ ticket: updated });
}
