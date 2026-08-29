import { and, eq, like, or, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { requests, users } from "@/db/schema";
import { getSession } from "@/lib/authz";
import { isUniqueViolation } from "@/lib/db-errors";
import { formatPtDateTime } from "@/lib/format";
import { computeRequestSlaDueAt } from "@/lib/requests-sla";
import { parseJsonBody, requestCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const session = getSession(request);

  const scopeConditions = [];
  if (session.accessLevel === "requester") {
    scopeConditions.push(eq(requests.ownerUserId, session.userId));
  }
  if (session.accessLevel === "requester" || session.accessLevel === "company_admin") {
    if (session.companyId != null) scopeConditions.push(eq(requests.companyId, session.companyId));
  }
  if (q) {
    scopeConditions.push(
      or(
        like(requests.id, `%${q}%`),
        like(requests.subject, `%${q}%`),
        like(requests.supplier, `%${q}%`),
        like(requests.status, `%${q}%`)
      )
    );
  }

  const rows = await db
    .select()
    .from(requests)
    .where(scopeConditions.length ? and(...scopeConditions) : undefined)
    .orderBy(desc(requests.createdAt));

  return Response.json({ requests: rows });
}

export async function POST(request: Request) {
  const db = getDb();
  const parsed = await parseJsonBody(request, requestCreateSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const session = getSession(request);
  const [currentUser] = await db.select().from(users).where(eq(users.id, session.userId));

  const priority = payload.priority ?? "Média";
  const sla = priority === "Alta" ? "4 horas" : priority === "Média" ? "8 horas" : "16 horas";
  const now = new Date();
  const slaDueAt = computeRequestSlaDueAt(priority, now);

  const values = {
    subject: payload.subject?.trim() || "Novo pedido operacional",
    tower: payload.tower ?? "Requisition-to-PO",
    type: payload.type?.trim() || "PO standard",
    value: Number(String(payload.value ?? "").replace(/\D/g, "")) || 0,
    status: "Validação",
    priority,
    owner: currentUser?.name ?? "Desconhecido",
    ownerUserId: session.userId,
    companyId: session.companyId,
    sla,
    slaDueAt,
    stage: 1,
    submitted: formatPtDateTime(now),
    supplier: payload.supplier ?? "",
    costCenter: payload.costCenter ?? "",
  };

  const created = await insertRequestWithGeneratedId(db, values);

  return Response.json({ request: created }, { status: 201 });
}

type NewRequestValues = Omit<typeof requests.$inferInsert, "id">;

// Um id baseado em COUNT(*) colide assim que a tabela tem qualquer linha
// fora dessa sequência (dados semeados, pedidos de outra origem) — mesma
// classe de bug já corrigida para POs e pedidos de suporte. Sorteia um id
// fora do intervalo usado pelos dados de demonstração (0800-0899) e volta
// a tentar no caso raro de colisão real.
async function insertRequestWithGeneratedId(db: ReturnType<typeof getDb>, values: NewRequestValues) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `REQ-2026-${1000 + Math.floor(Math.random() * 9000)}`;
    try {
      const [created] = await db.insert(requests).values({ id, ...values }).returning();
      return created;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }
  throw new Error("Não foi possível gerar um id de pedido único");
}
