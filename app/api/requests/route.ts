import { eq, like, or, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { requests } from "@/db/schema";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const rows = q
    ? db
        .select()
        .from(requests)
        .where(
          or(
            like(requests.id, `%${q}%`),
            like(requests.subject, `%${q}%`),
            like(requests.supplier, `%${q}%`),
            like(requests.status, `%${q}%`)
          )
        )
        .orderBy(desc(requests.createdAt))
        .all()
    : db.select().from(requests).orderBy(desc(requests.createdAt)).all();

  return Response.json({ requests: rows });
}

export async function POST(request: Request) {
  const db = getDb();
  const payload = (await request.json()) as {
    tower?: string;
    type?: string;
    subject?: string;
    costCenter?: string;
    supplier?: string;
    value?: string;
    priority?: string;
    owner?: string;
  };

  const count = db.select().from(requests).all().length;
  const id = `REQ-2026-${String(815 + count).padStart(4, "0")}`;

  const sla = payload.priority === "Alta" ? "4 horas" : payload.priority === "Média" ? "8 horas" : "16 horas";

  const [created] = db
    .insert(requests)
    .values({
      id,
      subject: payload.subject?.trim() || "Novo pedido operacional",
      tower: payload.tower ?? "Requisition-to-PO",
      value: Number(String(payload.value ?? "").replace(/\D/g, "")) || 0,
      status: "Validação",
      priority: payload.priority ?? "Média",
      owner: payload.owner ?? "Ana Manuel",
      sla,
      stage: 1,
      submitted: "Agora",
      supplier: payload.supplier ?? "",
      costCenter: payload.costCenter ?? "",
    })
    .returning().all();

  return Response.json({ request: created }, { status: 201 });
}
