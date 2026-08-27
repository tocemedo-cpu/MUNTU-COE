import { and, eq, like, or, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { requests, users } from "@/db/schema";
import { getSession } from "@/lib/authz";
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

  const total = (await db.select().from(requests)).length;
  const id = `REQ-2026-${String(815 + total).padStart(4, "0")}`;

  const sla = payload.priority === "Alta" ? "4 horas" : payload.priority === "Média" ? "8 horas" : "16 horas";

  const [created] = await db
    .insert(requests)
    .values({
      id,
      subject: payload.subject?.trim() || "Novo pedido operacional",
      tower: payload.tower ?? "Requisition-to-PO",
      value: Number(String(payload.value ?? "").replace(/\D/g, "")) || 0,
      status: "Validação",
      priority: payload.priority ?? "Média",
      owner: currentUser?.name ?? "Desconhecido",
      ownerUserId: session.userId,
      companyId: session.companyId,
      sla,
      stage: 1,
      submitted: "Agora",
      supplier: payload.supplier ?? "",
      costCenter: payload.costCenter ?? "",
    })
    .returning();

  return Response.json({ request: created }, { status: 201 });
}
