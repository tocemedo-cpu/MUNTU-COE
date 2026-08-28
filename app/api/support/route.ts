import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supportMessages, supportTickets, users } from "@/db/schema";
import { getSession } from "@/lib/authz";
import { computeSlaDueAt } from "@/lib/support";
import { parseJsonBody, supportTicketCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  // Qualquer utilizador vê só os seus próprios pedidos; só o System Admin
  // vê a caixa de entrada completa — é essa a distinção que define a
  // persona "caixa de suporte", não o nível de acesso em si.
  const rows = await db
    .select()
    .from(supportTickets)
    .where(session.accessLevel === "system_admin" ? undefined : eq(supportTickets.userId, session.userId))
    .orderBy(desc(supportTickets.createdAt));

  return Response.json({ tickets: rows });
}

export async function POST(request: Request) {
  const db = getDb();
  const parsed = await parseJsonBody(request, supportTicketCreateSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const session = getSession(request);
  const [currentUser] = await db.select().from(users).where(eq(users.id, session.userId));

  // Um id baseado em contagem de linhas colide assim que a tabela tem
  // qualquer linha fora dessa sequência, e tem uma condição de corrida
  // entre criações concorrentes (mesmo problema já corrigido para os ids
  // de PO em app/api/requests/[id]/route.ts) — por isso sorteia e tenta de
  // novo no caso raro de colisão, em vez de contar linhas.
  const year = new Date().getFullYear();
  let created: typeof supportTickets.$inferSelect | undefined;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const id = `SUP-${year}-${String(1000 + Math.floor(Math.random() * 9000)).padStart(4, "0")}`;
    try {
      const [row] = await db
        .insert(supportTickets)
        .values({
          id,
          subject: payload.subject,
          category: payload.category ?? "Geral",
          priority: payload.priority ?? "normal",
          status: "aberto",
          userId: session.userId,
          companyId: session.companyId,
          slaDueAt: computeSlaDueAt(payload.priority ?? "normal"),
        })
        .returning();
      created = row;
    } catch (error) {
      const isUniqueViolation = (error as { code?: string } | undefined)?.code === "23505";
      if (!isUniqueViolation || attempt === 4) throw error;
    }
  }
  if (!created) return Response.json({ error: "Não foi possível criar o pedido de suporte" }, { status: 500 });

  await db.insert(supportMessages).values({ ticketId: created.id, authorUserId: session.userId, body: payload.message });

  return Response.json({ ticket: { ...created, authorName: currentUser?.name ?? "Desconhecido" } }, { status: 201 });
}
