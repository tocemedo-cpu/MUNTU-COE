import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, requests, suppliers, tenderInvites, tenders } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { isUniqueViolation } from "@/lib/db-errors";
import { parseJsonBody, tenderCreateSchema } from "@/lib/validation";

// Listagem: um fornecedor só vê tenders para os quais foi convidado
// (nunca a lista completa de sourcing da Muntu); um company_admin só vê
// os da sua própria empresa; analyst/coe_manager/system_admin vêem todos.
export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  if (session.accessLevel === "supplier") {
    if (session.supplierId == null) return Response.json({ tenders: [] });
    const rows = await db
      .select({ tender: tenders })
      .from(tenderInvites)
      .innerJoin(tenders, eq(tenderInvites.tenderId, tenders.id))
      .where(eq(tenderInvites.supplierId, session.supplierId))
      .orderBy(desc(tenders.createdAt));
    return Response.json({ tenders: rows.map((row) => row.tender) });
  }

  const conditions = [];
  if (session.accessLevel === "company_admin" && session.companyId != null) {
    conditions.push(eq(tenders.companyId, session.companyId));
  }
  const rows = await db
    .select()
    .from(tenders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tenders.createdAt));
  return Response.json({ tenders: rows });
}

// Abre um tender e já convida os fornecedores indicados — as duas coisas
// juntas porque um tender sem nenhum fornecedor convidado não tem
// utilidade nenhuma (ninguém consegue propor).
export async function POST(request: Request) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager", "system_admin"]);
  if (forbidden) return forbidden;

  const session = getSession(request);
  const parsed = await parseJsonBody(request, tenderCreateSchema);
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
      return Response.json({ error: "Indique a empresa para este tender." }, { status: 400 });
    }
    const [company] = await db.select().from(companies).where(eq(companies.id, payload.companyId));
    if (!company) return Response.json({ error: "Empresa não encontrada" }, { status: 400 });
    companyId = payload.companyId;
  }

  if (payload.requestId) {
    const [request_] = await db.select().from(requests).where(eq(requests.id, payload.requestId));
    if (!request_ || request_.companyId !== companyId) {
      return Response.json({ error: "Pedido não encontrado para esta empresa." }, { status: 400 });
    }
  }

  const supplierRows = await db.select().from(suppliers).where(inArray(suppliers.id, payload.supplierIds));
  if (supplierRows.length !== new Set(payload.supplierIds).size) {
    return Response.json({ error: "Um ou mais fornecedores convidados não existem." }, { status: 400 });
  }

  const deadline = new Date(payload.deadline);
  if (Number.isNaN(deadline.getTime())) {
    return Response.json({ error: "Prazo inválido" }, { status: 400 });
  }

  const newTenderValues = {
    title: payload.title.trim(),
    description: payload.description?.trim() || "",
    companyId,
    requestId: payload.requestId || null,
    createdByUserId: session.userId,
    deadline,
    status: "aberto",
  };

  const created = await db.transaction(async (tx) => {
    // Insert + convites na mesma transacção: um tender sem nenhum
    // fornecedor convidado não tem utilidade nenhuma (ninguém consegue
    // propor), por isso não pode ficar criado se os convites falharem.
    let tender: typeof tenders.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = `RFQ-2026-${1000 + Math.floor(Math.random() * 9000)}`;
      try {
        [tender] = await tx.insert(tenders).values({ id, ...newTenderValues }).returning();
        break;
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 4) throw error;
      }
    }
    if (!tender) throw new Error("Não foi possível gerar um id de tender único");
    await tx.insert(tenderInvites).values(Array.from(new Set(payload.supplierIds)).map((supplierId) => ({ tenderId: tender.id, supplierId })));
    return tender;
  });

  return Response.json({ tender: created }, { status: 201 });
}
