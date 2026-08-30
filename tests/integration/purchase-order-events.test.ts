import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, poEvents, purchaseOrders, receipts, suppliers, users } from "@/db/schema";
import { GET as getPo, PATCH as patchPo } from "@/app/api/purchase-orders/[id]/route";
import { PATCH as patchReceipt } from "@/app/api/receipts/[id]/route";

async function makeUser(label: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ name: `Utilizador PO ${label}`, email: `po-events-user-${label}-${Date.now()}-${Math.random()}@example.com`, role: "Teste", initials: "PE", ...extra })
    .returning();
  return user;
}

async function makeCompanyAndPo(label: string, status: string) {
  const db = getDb();
  const [company] = await db.insert(companies).values({ name: `Empresa PO ${label}`, domain: uniqueDomain(`po-events-${label}`) }).returning();
  const [po] = await db
    .insert(purchaseOrders)
    .values({ id: `PO-TEST-EVT-${label}-${Date.now()}`, supplier: "Fornecedor Teste", description: "Item de teste", value: 100_000, status, companyId: company.id })
    .returning();
  return { company, po };
}

describe("GET /api/purchase-orders/:id", () => {
  it("returns the PO and its events ordered oldest first, and blocks cross-company access", async () => {
    const { company, po } = await makeCompanyAndPo("get1", "Confirmado");
    const db = getDb();
    await db.insert(poEvents).values([
      { poId: po.id, type: "criada", description: "Primeiro evento" },
      { poId: po.id, type: "expediting", description: "Segundo evento" },
    ]);

    const response = await getPo(
      jsonRequest(`http://localhost/api/purchase-orders/${po.id}`, { method: "GET", session: { userId: 1, accessLevel: "company_admin", companyId: company.id } }),
      { params: Promise.resolve({ id: po.id }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.events).toHaveLength(2);
    expect(body.events[0].description).toBe("Primeiro evento");
    expect(body.events[1].description).toBe("Segundo evento");

    const otherCompany = (await getDb().insert(companies).values({ name: "Outra empresa", domain: uniqueDomain("po-events-other") }).returning())[0];
    const forbidden = await getPo(
      jsonRequest(`http://localhost/api/purchase-orders/${po.id}`, { method: "GET", session: { userId: 1, accessLevel: "company_admin", companyId: otherCompany.id } }),
      { params: Promise.resolve({ id: po.id }) }
    );
    expect(forbidden.status).toBe(403);
  });
});

describe("PATCH /api/purchase-orders/:id (status transitions)", () => {
  it("ships a Confirmado PO, then delivers it, recording a real event at each step", async () => {
    const { company, po } = await makeCompanyAndPo("ship", "Confirmado");
    const user = await makeUser("ship");
    const session = { userId: user.id, accessLevel: "company_admin" as const, companyId: company.id };

    const shipped = await patchPo(
      jsonRequest(`http://localhost/api/purchase-orders/${po.id}`, { method: "PATCH", session, body: { action: "ship" } }),
      { params: Promise.resolve({ id: po.id }) }
    );
    expect(shipped.status).toBe(200);
    const shippedBody = await shipped.json();
    expect(shippedBody.purchaseOrder.status).toBe("Expediting");

    const delivered = await patchPo(
      jsonRequest(`http://localhost/api/purchase-orders/${po.id}`, { method: "PATCH", session, body: { action: "deliver" } }),
      { params: Promise.resolve({ id: po.id }) }
    );
    expect(delivered.status).toBe(200);
    const deliveredBody = await delivered.json();
    expect(deliveredBody.purchaseOrder.status).toBe("Entregue");

    const db = getDb();
    const events = await db.select().from(poEvents).where(eq(poEvents.poId, po.id));
    expect(events.map((event) => event.type)).toEqual(["expediting", "entregue"]);
    expect(events.every((event) => event.userId === user.id)).toBe(true);
  });

  it("rejects an out-of-order transition (deliver on a Confirmado PO) with a 400 and no event written", async () => {
    const { company, po } = await makeCompanyAndPo("badtransition", "Confirmado");
    const user = await makeUser("badtransition");

    const response = await patchPo(
      jsonRequest(`http://localhost/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        session: { userId: user.id, accessLevel: "company_admin", companyId: company.id },
        body: { action: "deliver" },
      }),
      { params: Promise.resolve({ id: po.id }) }
    );
    expect(response.status).toBe(400);

    const db = getDb();
    const events = await db.select().from(poEvents).where(eq(poEvents.poId, po.id));
    expect(events).toHaveLength(0);
    const [unchanged] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, po.id));
    expect(unchanged.status).toBe("Confirmado");
  });

  it("flags and resolves an exception, returning the PO to Expediting", async () => {
    const { company, po } = await makeCompanyAndPo("exception", "Expediting");
    const user = await makeUser("exception");
    const session = { userId: user.id, accessLevel: "coe_manager" as const, companyId: company.id };

    const flagged = await patchPo(
      jsonRequest(`http://localhost/api/purchase-orders/${po.id}`, { method: "PATCH", session, body: { action: "flag_exception", note: "Fornecedor atrasado" } }),
      { params: Promise.resolve({ id: po.id }) }
    );
    expect(flagged.status).toBe(200);
    expect((await flagged.json()).purchaseOrder.status).toBe("Excepção");

    const resolved = await patchPo(
      jsonRequest(`http://localhost/api/purchase-orders/${po.id}`, { method: "PATCH", session, body: { action: "resolve_exception" } }),
      { params: Promise.resolve({ id: po.id }) }
    );
    expect(resolved.status).toBe(200);
    expect((await resolved.json()).purchaseOrder.status).toBe("Expediting");

    const db = getDb();
    const events = await db.select().from(poEvents).where(eq(poEvents.poId, po.id));
    expect(events.map((event) => event.type)).toEqual(["excepcao", "excepcao_resolvida"]);
    expect(events[0].description).toContain("Fornecedor atrasado");
  });

  it("forbids a supplier from advancing PO status", async () => {
    const { po } = await makeCompanyAndPo("supplier", "Confirmado");
    const [supplier] = await getDb().insert(suppliers).values({ name: "Fornecedor sem permissão", category: "Geral" }).returning();

    const response = await patchPo(
      jsonRequest(`http://localhost/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "supplier", supplierId: supplier.id },
        body: { action: "ship" },
      }),
      { params: Promise.resolve({ id: po.id }) }
    );
    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/receipts/:id (confirm) — links a real po_events entry", () => {
  it("records a 'confirmada' event when the receipt's po matches a real PO", async () => {
    const { company, po } = await makeCompanyAndPo("receipt", "Expediting");
    const user = await makeUser("receipt");
    const db = getDb();
    const [receipt] = await db
      .insert(receipts)
      .values({ po: po.id, description: "Peças recebidas", supplier: "Fornecedor Teste", value: 100_000, progress: 100, companyId: company.id })
      .returning();

    const response = await patchReceipt(
      jsonRequest(`http://localhost/api/receipts/${receipt.id}`, {
        method: "PATCH",
        session: { userId: user.id, accessLevel: "company_admin", companyId: company.id },
        body: { action: "confirm" },
      }),
      { params: Promise.resolve({ id: String(receipt.id) }) }
    );
    expect(response.status).toBe(200);

    const events = await db.select().from(poEvents).where(eq(poEvents.poId, po.id));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("confirmada");
    expect(events[0].userId).toBe(user.id);
  });

  it("does not fail or write an event when the receipt's po does not match any real PO (free-text field, seeded data)", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Empresa sem PO real", domain: uniqueDomain("po-events-no-match") }).returning();
    const [receipt] = await db
      .insert(receipts)
      .values({ po: "PO-SEM-CORRESPONDENCIA", description: "Peças recebidas", supplier: "Fornecedor Teste", value: 50_000, progress: 100, companyId: company.id })
      .returning();

    const response = await patchReceipt(
      jsonRequest(`http://localhost/api/receipts/${receipt.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
        body: { action: "confirm" },
      }),
      { params: Promise.resolve({ id: String(receipt.id) }) }
    );
    expect(response.status).toBe(200);

    const events = await db.select().from(poEvents).where(eq(poEvents.description, "PO-SEM-CORRESPONDENCIA"));
    expect(events).toHaveLength(0);
  });
});
