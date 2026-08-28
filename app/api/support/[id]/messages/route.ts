import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supportMessages, supportTickets, users } from "@/db/schema";
import { getSession } from "@/lib/authz";
import { parseJsonBody, supportMessageCreateSchema } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseJsonBody(request, supportMessageCreateSchema);
  if (!parsed.success) return parsed.response;

  const db = getDb();
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
  if (!ticket) return Response.json({ error: "Pedido de suporte não encontrado" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel !== "system_admin" && ticket.userId !== session.userId) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const [message] = await db
    .insert(supportMessages)
    .values({ ticketId: id, authorUserId: session.userId, body: parsed.data.body })
    .returning();

  // Uma resposta do System Admin move o pedido de "aberto" para "em
  // curso" automaticamente — sinaliza que já está a ser tratado, sem
  // precisar de um passo manual à parte.
  if (session.accessLevel === "system_admin" && ticket.status === "aberto") {
    await db.update(supportTickets).set({ status: "em_curso", updatedAt: new Date() }).where(eq(supportTickets.id, id));
  } else {
    await db.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, id));
  }

  const [currentUser] = await db.select().from(users).where(eq(users.id, session.userId));
  return Response.json({ message: { ...message, authorName: currentUser?.name ?? "Desconhecido" } }, { status: 201 });
}
