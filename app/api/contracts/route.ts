import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, contracts, requests, suppliers } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { isUniqueViolation } from "@/lib/db-errors";
import { contractCreateSchema, parseJsonBody } from "@/lib/validation";

// Listagem escopada: fornecedor só vê os seus próprios contratos,
// company_admin só os da sua empresa — mesmo padrão de /api/purchase-orders.
export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  const conditions = [];
  if (session.accessLevel === "supplier") {
    if (session.supplierId == null) return Response.json({ contracts: [] });
    conditions.push(eq(contracts.supplierId, session.supplierId));
  } else if (session.accessLevel === "company_admin" && session.companyId != null) {
    conditions.push(eq(contracts.companyId, session.companyId));
  }

  const rows = await db
    .select()
    .from(contracts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(contracts.createdAt));
  return Response.json({ contracts: rows });
}

// Procurement, fora do system_admin desde o redesenho de RBAC (ver README
// §Personas e permissões).
export async function POST(request: Request) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager"]);
  if (forbidden) return forbidden;

  const session = getSession(request);
  const parsed = await parseJsonBody(request, contractCreateSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const db = getDb();

  let companyId: number;
  if (session.accessLevel === "company_admin") {
    if (session.companyId == null) {
      return Response.json({ error: "A sua conta não está ligada a nenhuma empresa." }, { status: 400 });
    }
    companyId = session.companyId;
  } else {
    if (!payload.companyId) {
      return Response.json({ error: "Indique a empresa para este contrato." }, { status: 400 });
    }
    const [company] = await db.select().from(companies).where(eq(companies.id, payload.companyId));
    if (!company) return Response.json({ error: "Empresa não encontrada" }, { status: 400 });
    companyId = payload.companyId;
  }

  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, payload.supplierId));
  if (!supplier) return Response.json({ error: "Fornecedor não encontrado" }, { status: 400 });

  if (payload.requestId) {
    const [request_] = await db.select().from(requests).where(eq(requests.id, payload.requestId));
    if (!request_ || request_.companyId !== companyId) {
      return Response.json({ error: "Pedido não encontrado para esta empresa." }, { status: 400 });
    }
  }

  const created = await insertContractWithGeneratedId(db, {
    title: payload.title.trim(),
    supplier: supplier.name,
    supplierId: supplier.id,
    companyId,
    requestId: payload.requestId || null,
    value: payload.value,
    startDate: new Date(payload.startDate),
    endDate: new Date(payload.endDate),
    notes: payload.notes?.trim() || "",
    status: "activo",
    createdByUserId: session.userId,
  });

  return Response.json({ contract: created }, { status: 201 });
}

type NewContractValues = Omit<typeof contracts.$inferInsert, "id">;

async function insertContractWithGeneratedId(db: ReturnType<typeof getDb>, values: NewContractValues) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `CTR-2026-${1000 + Math.floor(Math.random() * 9000)}`;
    try {
      const [created] = await db.insert(contracts).values({ id, ...values }).returning();
      return created;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }
  throw new Error("Não foi possível gerar um id de contrato único");
}
