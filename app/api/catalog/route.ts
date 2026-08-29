import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogItems, suppliers } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { isUniqueViolation } from "@/lib/db-errors";
import { catalogItemCreateSchema, parseJsonBody } from "@/lib/validation";

// Um fornecedor só vê os seus próprios itens (incluindo inactivos, para
// saber o que já foi retirado); quem cura o catálogo (analyst/coe_manager/
// system_admin) vê tudo, para conseguir reactivar um item; qualquer outra
// pessoa (requester/company_admin, a navegar o catálogo para um pedido
// "PO catalogado") só vê os itens activos.
export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  const conditions = [];
  if (session.accessLevel === "supplier") {
    if (session.supplierId == null) return Response.json({ items: [] });
    conditions.push(eq(catalogItems.supplierId, session.supplierId));
  } else if (!["analyst", "coe_manager", "system_admin"].includes(session.accessLevel)) {
    conditions.push(eq(catalogItems.active, true));
  }

  const rows = await db
    .select()
    .from(catalogItems)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(catalogItems.createdAt));
  return Response.json({ items: rows });
}

// A Muntu cura o catálogo, não a empresa cliente nem o próprio fornecedor
// — os preços pré-negociados vêm de uma negociação feita pela equipa de
// sourcing, o mesmo motivo por que só analyst/coe_manager/system_admin
// editam `suppliers.passport`/`risk` em vez do próprio fornecedor.
export async function POST(request: Request) {
  const forbidden = forbidUnless(request, ["analyst", "coe_manager", "system_admin"]);
  if (forbidden) return forbidden;

  const session = getSession(request);
  const parsed = await parseJsonBody(request, catalogItemCreateSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, payload.supplierId));
  if (!supplier) return Response.json({ error: "Fornecedor não encontrado" }, { status: 400 });

  const created = await insertCatalogItemWithGeneratedId(db, {
    name: payload.name.trim(),
    description: payload.description?.trim() || "",
    category: payload.category?.trim() || "",
    supplier: supplier.name,
    supplierId: supplier.id,
    unitPrice: payload.unitPrice,
    unit: payload.unit?.trim() || "un",
    active: true,
    createdByUserId: session.userId,
  });

  return Response.json({ item: created }, { status: 201 });
}

type NewCatalogItemValues = Omit<typeof catalogItems.$inferInsert, "id">;

async function insertCatalogItemWithGeneratedId(db: ReturnType<typeof getDb>, values: NewCatalogItemValues) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `CAT-2026-${1000 + Math.floor(Math.random() * 9000)}`;
    try {
      const [created] = await db.insert(catalogItems).values({ id, ...values }).returning();
      return created;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }
  throw new Error("Não foi possível gerar um id de item de catálogo único");
}
