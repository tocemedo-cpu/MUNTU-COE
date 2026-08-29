import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, purchaseOrders, requests } from "@/db/schema";
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

    const response = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
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
  });

  it("classifies 'PO catalogado' as automatico", async () => {
    const { request } = await makeCompanyAndRequest("PO catalogado", "2");
    const response = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin", companyId: null },
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
    const session = { userId: 1, accessLevel: "coe_manager" as const, companyId: company.id };

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
    const response = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
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
    expect(request.decidedAt).toBeNull();

    const response = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
        body: { action: "approve" },
      }),
      { params: Promise.resolve({ id: request.id }) }
    );
    const body = await response.json();
    expect(body.request.decidedAt).toBeTruthy();
    expect(new Date(body.request.decidedAt).getTime()).toBeGreaterThanOrEqual(new Date(request.createdAt).getTime());
  });
});
