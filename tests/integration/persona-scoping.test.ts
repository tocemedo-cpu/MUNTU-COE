import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, requests, suppliers } from "@/db/schema";
import { GET as listRequests } from "@/app/api/requests/route";
import { GET as getRequestById } from "@/app/api/requests/[id]/route";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { PATCH as patchSupplier } from "@/app/api/suppliers/[id]/route";

async function insertRequest(db: ReturnType<typeof getDb>, companyId: number, id: string) {
  await db.insert(requests).values({
    id,
    subject: "Pedido de teste",
    tower: "Requisition-to-PO",
    value: 1000,
    status: "Validação",
    priority: "Normal",
    owner: "Teste",
    companyId,
    sla: "24h",
    stage: 1,
    submitted: "hoje",
    supplier: "Fornecedor Teste",
    costCenter: "TEST",
  });
}

// analyst e supplier não têm noção nenhuma de "dono" de pedido — antes
// desta correcção, a ausência de qualquer condição de âmbito para estes
// dois níveis fazia a rota devolver os pedidos de TODAS as empresas.
describe("GET /api/requests — analyst e supplier nunca veem pedidos de outra empresa", () => {
  it("devolve lista vazia para analyst, mesmo havendo pedidos reais noutras empresas", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Empresa Fuga A", domain: uniqueDomain("leak-a") }).returning();
    await insertRequest(db, company.id, `REQ-LEAK-A-${Date.now()}`);

    const response = await listRequests(
      jsonRequest("http://localhost/api/requests", { method: "GET", session: { userId: 1, accessLevel: "analyst" } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.requests).toEqual([]);
  });

  it("devolve lista vazia para supplier, mesmo havendo pedidos reais noutras empresas", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Empresa Fuga B", domain: uniqueDomain("leak-b") }).returning();
    await insertRequest(db, company.id, `REQ-LEAK-B-${Date.now()}`);

    const response = await listRequests(
      jsonRequest("http://localhost/api/requests", { method: "GET", session: { userId: 2, accessLevel: "supplier", supplierId: 1 } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.requests).toEqual([]);
  });
});

describe("GET /api/requests/:id — analyst e supplier não conseguem aceder a um pedido por id adivinhado", () => {
  it("recusa com 403 para analyst", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Empresa Fuga C", domain: uniqueDomain("leak-c") }).returning();
    const id = `REQ-LEAK-C-${Date.now()}`;
    await insertRequest(db, company.id, id);

    const response = await getRequestById(
      jsonRequest(`http://localhost/api/requests/${id}`, { method: "GET", session: { userId: 1, accessLevel: "analyst" } }),
      { params: Promise.resolve({ id }) }
    );
    expect(response.status).toBe(403);
  });

  it("recusa com 403 para supplier", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Empresa Fuga D", domain: uniqueDomain("leak-d") }).returning();
    const id = `REQ-LEAK-D-${Date.now()}`;
    await insertRequest(db, company.id, id);

    const response = await getRequestById(
      jsonRequest(`http://localhost/api/requests/${id}`, { method: "GET", session: { userId: 2, accessLevel: "supplier", supplierId: 1 } }),
      { params: Promise.resolve({ id }) }
    );
    expect(response.status).toBe(403);
  });
});

// Antes desta correcção, GET /api/dashboard não filtrava nada — um
// company_admin via os números da plataforma inteira, não só da sua
// própria empresa.
describe("GET /api/dashboard — company_admin só vê a sua própria empresa", () => {
  it("exclui pedidos de outras empresas para company_admin", async () => {
    const db = getDb();
    const [ownCompany] = await db.insert(companies).values({ name: "Empresa Dashboard Própria", domain: uniqueDomain("dash-own") }).returning();
    const [otherCompany] = await db.insert(companies).values({ name: "Empresa Dashboard Alheia", domain: uniqueDomain("dash-other") }).returning();
    await insertRequest(db, ownCompany.id, `REQ-DASH-OWN-${Date.now()}`);
    await insertRequest(db, otherCompany.id, `REQ-DASH-OTHER-${Date.now()}`);

    const response = await getDashboard(
      jsonRequest("http://localhost/api/dashboard", { method: "GET", session: { userId: 1, accessLevel: "company_admin", companyId: ownCompany.id } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.transactionCount).toBe(1);
  });

  it("continua a ver a plataforma inteira para coe_manager", async () => {
    const db = getDb();
    const [companyA] = await db.insert(companies).values({ name: "Empresa Dashboard A", domain: uniqueDomain("dash-a") }).returning();
    const [companyB] = await db.insert(companies).values({ name: "Empresa Dashboard B", domain: uniqueDomain("dash-b") }).returning();
    await insertRequest(db, companyA.id, `REQ-DASH-A-${Date.now()}`);
    await insertRequest(db, companyB.id, `REQ-DASH-B-${Date.now()}`);

    const before = await getDashboard(
      jsonRequest("http://localhost/api/dashboard", { method: "GET", session: { userId: 1, accessLevel: "coe_manager" } })
    );
    const beforeCount = (await before.json()).transactionCount as number;
    expect(beforeCount).toBeGreaterThanOrEqual(2);
  });
});

// Antes desta correcção, um company_admin conseguia mudar risco/passport/
// estado de qualquer fornecedor via chamada directa à API, apesar de a
// interface nunca lhe mostrar esse formulário e de essa avaliação ser só
// da Muntu (analyst/coe_manager/system_admin).
describe("PATCH /api/suppliers/:id — company_admin não edita avaliação da Muntu", () => {
  it("aplica iban/bic mas ignora risk/passport/status vindos de um company_admin", async () => {
    const db = getDb();
    const [supplier] = await db
      .insert(suppliers)
      .values({ name: `Fornecedor Company Admin ${Date.now()}`, category: "Geral", risk: "Baixo", passport: 40, status: "Activo" })
      .returning();

    const response = await patchSupplier(
      jsonRequest(`http://localhost/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "company_admin", companyId: 1 },
        body: { iban: "AO06004000000198765432101", bic: "BFAAAOLU", risk: "Alto", passport: 0, status: "Bloqueado" },
      }),
      { params: Promise.resolve({ id: String(supplier.id) }) }
    );

    expect(response.status).toBe(200);
    const [stored] = await db.select().from(suppliers).where(eq(suppliers.id, supplier.id));
    expect(stored.iban).toBe("AO06004000000198765432101");
    expect(stored.bic).toBe("BFAAAOLU");
    // supplierCompanyAdminUpdateSchema não conhece estes campos — zod
    // descarta-os (strip por omissão), nunca chegam ao update().
    expect(stored.risk).toBe("Baixo");
    expect(stored.passport).toBe(40);
    expect(stored.status).toBe("Activo");
  });

  it("analyst continua a poder editar risk/passport/status (avaliação interna da Muntu)", async () => {
    const db = getDb();
    const [supplier] = await db
      .insert(suppliers)
      .values({ name: `Fornecedor Analyst ${Date.now()}`, category: "Geral", risk: "Baixo", passport: 40, status: "Activo" })
      .returning();

    const response = await patchSupplier(
      jsonRequest(`http://localhost/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        session: { userId: 2, accessLevel: "analyst" },
        body: { risk: "Alto", passport: 90, status: "Aprovado" },
      }),
      { params: Promise.resolve({ id: String(supplier.id) }) }
    );

    expect(response.status).toBe(200);
    const [stored] = await db.select().from(suppliers).where(eq(suppliers.id, supplier.id));
    expect(stored.risk).toBe("Alto");
    expect(stored.passport).toBe(90);
    expect(stored.status).toBe("Aprovado");
  });
});
