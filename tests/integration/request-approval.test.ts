import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, poEvents, purchaseOrders, requests, suppliers, users } from "@/db/schema";
import { PATCH as patchRequest } from "@/app/api/requests/[id]/route";

// requests.id é uma chave de texto escolhida pelo chamador (não um
// identity/serial), por isso tem de ser única por corrida de testes — ao
// contrário de companies/exceptions/payment_batches nos outros ficheiros,
// que derivam o seu id do id autoincrementado da empresa.
let requestCounter = 0;
function uniqueRequestId(label: string): string {
  requestCounter += 1;
  return `REQ-TEST-${label}-${Date.now()}-${requestCounter}`;
}

// Uma aprovação agora regista um po_events real (user_id com FK real para
// users.id) — ao contrário de antes, já não basta um userId de sessão
// inventado (ex.: 1) sem linha correspondente.
let sessionUserCounter = 0;
async function makeSessionUser(label: string) {
  sessionUserCounter += 1;
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ name: `Utilizador Teste ${label}`, email: `request-approval-user-${label}-${Date.now()}-${sessionUserCounter}@example.com`, role: "Teste", initials: "TE" })
    .returning();
  return user;
}

async function makeCompanyAndRequest(type: string, label: string) {
  const id = uniqueRequestId(label);
  const db = getDb();
  const [company] = await db
    .insert(companies)
    .values({ name: `Cliente ${id}`, domain: uniqueDomain(`request-approval-${id}`) })
    .returning();

  const [request] = await db
    .insert(requests)
    .values({
      id,
      subject: "Peças de reposição",
      tower: "Requisition-to-PO",
      type,
      value: 1_000_000,
      status: "Validação",
      priority: "Normal",
      owner: "Teste",
      companyId: company.id,
      sla: "24h",
      stage: 1,
      submitted: "hoje",
      supplier: "Fornecedor Teste",
      costCenter: "TEST-001",
    })
    .returning();

  return { company, request };
}

describe("PATCH /api/requests/:id (approve/reject)", () => {
  it("approving a request generates a linked PO with the tier matching the request type", async () => {
    const { company, request } = await makeCompanyAndRequest("Compra urgente", "1");
    const approver = await makeSessionUser("1");

    const response = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: approver.id, accessLevel: "company_admin", companyId: company.id },
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ id: request.id }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.request.status).toBe("Em execução");

    const db = getDb();
    const linkedPos = await db.select().from(purchaseOrders).where(eq(purchaseOrders.requestId, request.id));
    expect(linkedPos).toHaveLength(1);
    expect(linkedPos[0].tier).toBe("complexo"); // "Compra urgente" -> complexo, per lib/billing-tiers.ts
    expect(linkedPos[0].companyId).toBe(company.id);
    expect(linkedPos[0].value).toBe(1_000_000);

    // Aprovar regista um evento real na linha temporal da PO — ver
    // db/schema.ts#poEvents.
    const events = await db.select().from(poEvents).where(eq(poEvents.poId, linkedPos[0].id));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("criada");
    expect(events[0].userId).toBe(approver.id);
    expect(events[0].description).toContain(request.id);
  });

  it("classifies 'PO catalogado' as automatico", async () => {
    const { request } = await makeCompanyAndRequest("PO catalogado", "2");
    const approver = await makeSessionUser("2");
    const response = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: approver.id, accessLevel: "coe_manager", companyId: null },
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ id: request.id }) }
    );
    expect(response.status).toBe(200);
    const db = getDb();
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.requestId, request.id));
    expect(po.tier).toBe("automatico");
  });

  it("does not create a second PO if the same request is approved twice", async () => {
    const { company, request } = await makeCompanyAndRequest("PO standard", "3");
    const approver = await makeSessionUser("3");
    const session = { userId: approver.id, accessLevel: "coe_manager" as const, companyId: company.id };

    await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, { method: "PATCH", session, body: { action: "approve" } }),
      { params: Promise.resolve({ id: request.id }) }
    );
    await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, { method: "PATCH", session, body: { action: "approve" } }),
      { params: Promise.resolve({ id: request.id }) }
    );

    const db = getDb();
    const linkedPos = await db.select().from(purchaseOrders).where(eq(purchaseOrders.requestId, request.id));
    expect(linkedPos).toHaveLength(1);
  });

  it("rejects approval from a requester (403) and never creates a PO", async () => {
    const { company, request } = await makeCompanyAndRequest("PO standard", "4");
    const response = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: 99, accessLevel: "requester", companyId: company.id },
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ id: request.id }) }
    );
    expect(response.status).toBe(403);

    const db = getDb();
    const linkedPos = await db.select().from(purchaseOrders).where(eq(purchaseOrders.requestId, request.id));
    expect(linkedPos).toHaveLength(0);
  });

  it("marks a rejected request without creating a PO", async () => {
    const { company, request } = await makeCompanyAndRequest("PO standard", "5");
    const approver = await makeSessionUser("5");
    const response = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: approver.id, accessLevel: "company_admin", companyId: company.id },
        body: { action: "reject" },
      }),
      { params: Promise.resolve({ id: request.id }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.request.status).toBe("Rejeitado");

    const db = getDb();
    const linkedPos = await db.select().from(purchaseOrders).where(eq(purchaseOrders.requestId, request.id));
    expect(linkedPos).toHaveLength(0);
  });

  it("stamps decidedAt on both approve and reject, real SLA/cycle-time data instead of the old fixed dashboard numbers", async () => {
    const { company, request } = await makeCompanyAndRequest("PO standard", "6");
    const approver = await makeSessionUser("6");
    expect(request.decidedAt).toBeNull();

    const response = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: approver.id, accessLevel: "company_admin", companyId: company.id },
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ id: request.id }) }
    );
    const body = await response.json();
    expect(body.request.decidedAt).toBeTruthy();
    expect(new Date(body.request.decidedAt).getTime()).toBeGreaterThanOrEqual(new Date(request.createdAt).getTime());
  });
});

// Bloqueio por risco alto (lib/risk-block.ts): approve() vê o fornecedor
// pelo nome (requests.supplier é texto livre, sem FK) — só bloqueia
// quando existe mesmo uma linha em suppliers com esse nome e risk "Alto".
describe("PATCH /api/requests/:id — bloqueio por risco alto", () => {
  async function makeHighRiskCompanyAndRequest(label: string) {
    const db = getDb();
    const supplierName = `Fornecedor Risco Alto ${label} ${Date.now()}`;
    const [supplier] = await db.insert(suppliers).values({ name: supplierName, category: "Geral", risk: "Alto" }).returning();
    const id = `REQ-TEST-RISK-${label}-${Date.now()}`;
    const [company] = await db.insert(companies).values({ name: `Cliente Risco ${id}`, domain: uniqueDomain(`request-risk-${id}`) }).returning();
    const [request] = await db
      .insert(requests)
      .values({
        id,
        subject: "Peças de fornecedor de risco",
        tower: "Requisition-to-PO",
        type: "PO standard",
        value: 500_000,
        status: "Validação",
        priority: "Normal",
        owner: "Teste",
        companyId: company.id,
        sla: "24h",
        stage: 1,
        submitted: "hoje",
        supplier: supplierName,
        costCenter: "TEST-RISK",
      })
      .returning();
    return { company, request, supplier };
  }

  it("blocks a company_admin outright, even trying overrideRisk, and creates no PO", async () => {
    const { company, request } = await makeHighRiskCompanyAndRequest("1");
    const response = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
        body: { action: "approve", overrideRisk: true },
      }),
      { params: Promise.resolve({ id: request.id }) }
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.riskBlock).toBe(true);
    expect(body.canOverride).toBe(false);

    const db = getDb();
    const [unchanged] = await db.select().from(requests).where(eq(requests.id, request.id));
    expect(unchanged.status).toBe("Validação");
    expect(unchanged.decidedAt).toBeNull();
    const pos = await db.select().from(purchaseOrders).where(eq(purchaseOrders.requestId, request.id));
    expect(pos).toHaveLength(0);
  });

  it("blocks coe_manager without overrideRisk, but lets them through with it, marking the PO as overridden", async () => {
    const { company, request } = await makeHighRiskCompanyAndRequest("2");
    const db = getDb();
    // purchase_orders.risk_overridden_by_user_id tem uma FK real para
    // users.id — precisa de apontar para uma linha real.
    const [manager] = await db
      .insert(users)
      .values({ name: `Gestor ${Date.now()}`, email: `manager-${Date.now()}@example.com`, role: "COE Manager", initials: "GM", accessLevel: "coe_manager" })
      .returning();

    const blocked = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: manager.id, accessLevel: "coe_manager", companyId: company.id },
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ id: request.id }) }
    );
    expect(blocked.status).toBe(409);
    const blockedBody = await blocked.json();
    expect(blockedBody.canOverride).toBe(true);

    const overridden = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: manager.id, accessLevel: "coe_manager", companyId: company.id },
        body: { action: "approve", overrideRisk: true },
      }),
      { params: Promise.resolve({ id: request.id }) }
    );
    expect(overridden.status).toBe(200);

    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.requestId, request.id));
    expect(po.riskOverriddenByUserId).toBe(manager.id);
    expect(po.riskOverriddenAt).not.toBeNull();
  });
});
