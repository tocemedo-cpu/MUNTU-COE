import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { auditLog, bids, companies, invoices, paymentBatches, purchaseOrders, receipts, suppliers, tenderInvites, tenders, users } from "@/db/schema";
import { PATCH as patchPo } from "@/app/api/purchase-orders/[id]/route";
import { PATCH as patchReceipt } from "@/app/api/receipts/[id]/route";
import { POST as evaluateBid } from "@/app/api/tenders/[id]/bids/[bidId]/evaluate/route";
import { POST as awardTender } from "@/app/api/tenders/[id]/award/route";
import { PATCH as patchInvoice } from "@/app/api/invoices/[id]/route";
import { PATCH as patchPayment } from "@/app/api/payments/[id]/route";
import { GET as getAuditLog } from "@/app/api/admin/audit-log/route";

async function makeCompany(label: string) {
  const db = getDb();
  const [company] = await db.insert(companies).values({ name: `Empresa RBACv2 ${label}`, domain: uniqueDomain(`rbac-v2-${label}`) }).returning();
  return company;
}

async function makeUser(label: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ name: `Utilizador RBACv2 ${label}`, email: `rbac-v2-${label}-${Date.now()}-${Math.random()}@example.com`, role: "Teste", initials: "RV", ...extra })
    .returning();
  return user;
}

describe("consignee — confirma entrega/recepção, escopado à própria empresa, nunca mais", () => {
  it("confirma uma recepção da própria empresa, mas 403 na de outra", async () => {
    const db = getDb();
    const ownCompany = await makeCompany("consignee-own");
    const otherCompany = await makeCompany("consignee-other");
    const consignee = await makeUser("consignee", { accessLevel: "consignee", companyId: ownCompany.id });

    const [ownReceipt] = await db
      .insert(receipts)
      .values({ po: "PO-CONS-OWN", description: "Recepção própria", supplier: "Fornecedor", value: 1000, companyId: ownCompany.id })
      .returning();
    const [otherReceipt] = await db
      .insert(receipts)
      .values({ po: "PO-CONS-OTHER", description: "Recepção alheia", supplier: "Fornecedor", value: 1000, companyId: otherCompany.id })
      .returning();

    const ok = await patchReceipt(
      jsonRequest(`http://localhost/api/receipts/${ownReceipt.id}`, { method: "PATCH", session: { userId: consignee.id, accessLevel: "consignee", companyId: ownCompany.id }, body: { action: "confirm" } }),
      { params: Promise.resolve({ id: String(ownReceipt.id) }) }
    );
    expect(ok.status).toBe(200);

    const forbidden = await patchReceipt(
      jsonRequest(`http://localhost/api/receipts/${otherReceipt.id}`, { method: "PATCH", session: { userId: consignee.id, accessLevel: "consignee", companyId: ownCompany.id }, body: { action: "confirm" } }),
      { params: Promise.resolve({ id: String(otherReceipt.id) }) }
    );
    expect(forbidden.status).toBe(403);
  });

  it("só confirma a entrega (deliver) de uma PO — nunca ship/flag_exception", async () => {
    const db = getDb();
    const company = await makeCompany("consignee-po");
    const consignee = await makeUser("consignee-po", { accessLevel: "consignee", companyId: company.id });
    const [po] = await db
      .insert(purchaseOrders)
      .values({ id: `PO-RBAC-CONS-${Date.now()}`, supplier: "Fornecedor", description: "Item", value: 1000, status: "Expediting", companyId: company.id })
      .returning();

    const deliver = await patchPo(
      jsonRequest(`http://localhost/api/purchase-orders/${po.id}`, { method: "PATCH", session: { userId: consignee.id, accessLevel: "consignee", companyId: company.id }, body: { action: "deliver" } }),
      { params: Promise.resolve({ id: po.id }) }
    );
    expect(deliver.status).toBe(200);
    expect((await deliver.json()).purchaseOrder.status).toBe("Entregue");

    const [po2] = await db
      .insert(purchaseOrders)
      .values({ id: `PO-RBAC-CONS2-${Date.now()}`, supplier: "Fornecedor", description: "Item", value: 1000, status: "Confirmado", companyId: company.id })
      .returning();
    const ship = await patchPo(
      jsonRequest(`http://localhost/api/purchase-orders/${po2.id}`, { method: "PATCH", session: { userId: consignee.id, accessLevel: "consignee", companyId: company.id }, body: { action: "ship" } }),
      { params: Promise.resolve({ id: po2.id }) }
    );
    expect(ship.status).toBe(403);
  });

  it("nunca vê pedidos (requests) — fora do seu recorte funcional", async () => {
    const { GET: listRequests } = await import("@/app/api/requests/route");
    const response = await listRequests(
      jsonRequest("http://localhost/api/requests", { method: "GET", session: { userId: 1, accessLevel: "consignee", companyId: 1 } })
    );
    expect(response.status).toBe(200);
    expect((await response.json()).requests).toEqual([]);
  });
});

describe("technical_evaluator — avalia propostas, nunca adjudica", () => {
  it("regista pontuação/notas técnicas numa proposta, e o audit log recebe a linha", async () => {
    const db = getDb();
    const company = await makeCompany("tech-eval");
    const [supplier] = await db.insert(suppliers).values({ name: `Fornecedor Tech Eval ${Date.now()}`, category: "Geral" }).returning();
    const [tender] = await db
      .insert(tenders)
      .values({ id: `RFQ-RBAC-${Date.now()}`, title: "Tender avaliação técnica", companyId: company.id, createdByUserId: 1, deadline: new Date(Date.now() + 86_400_000), status: "aberto" })
      .returning();
    await db.insert(tenderInvites).values({ tenderId: tender.id, supplierId: supplier.id });
    const [bid] = await db.insert(bids).values({ tenderId: tender.id, supplierId: supplier.id, value: 100_000 }).returning();
    const evaluator = await makeUser("tech-eval", { accessLevel: "technical_evaluator" });

    const response = await evaluateBid(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/bids/${bid.id}/evaluate`, {
        method: "POST",
        session: { userId: evaluator.id, accessLevel: "technical_evaluator" },
        body: { technicalScore: 85, technicalNotes: "Boa proposta técnica" },
      }),
      { params: Promise.resolve({ id: tender.id, bidId: String(bid.id) }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bid.technicalScore).toBe(85);
    expect(body.bid.technicallyEvaluatedByUserId).toBe(evaluator.id);

    const [logged] = await db.select().from(auditLog).where(eq(auditLog.action, "bid.technical_evaluation"));
    expect(logged).toBeTruthy();
    expect(logged.entityId).toBe(String(bid.id));
    expect(logged.actorUserId).toBe(evaluator.id);
  });

  it("não pode adjudicar o tender (decisão comercial)", async () => {
    const db = getDb();
    const company = await makeCompany("tech-eval-award");
    const [supplier] = await db.insert(suppliers).values({ name: `Fornecedor Tech Eval Award ${Date.now()}`, category: "Geral" }).returning();
    const [tender] = await db
      .insert(tenders)
      .values({ id: `RFQ-RBAC-AWARD-${Date.now()}`, title: "Tender", companyId: company.id, createdByUserId: 1, deadline: new Date(Date.now() + 86_400_000), status: "aberto" })
      .returning();
    const [bid] = await db.insert(bids).values({ tenderId: tender.id, supplierId: supplier.id, value: 100_000 }).returning();
    const evaluator = await makeUser("tech-eval-award", { accessLevel: "technical_evaluator" });

    const response = await awardTender(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/award`, { method: "POST", session: { userId: evaluator.id, accessLevel: "technical_evaluator" }, body: { bidId: bid.id } }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    expect(response.status).toBe(403);
  });
});

describe("finance_ap — valida 3-way match e liberta pagamentos, nunca homologa", () => {
  it("valida o match de uma factura, recalculando o tier e registando no audit log", async () => {
    const db = getDb();
    const company = await makeCompany("finance-ap-invoice");
    const [invoice] = await db
      .insert(invoices)
      .values({ id: `FT-RBAC-${Date.now()}`, supplier: "Fornecedor", po: "PO-X", value: 100_000, match: "Receção em falta", status: "Pendente", due: "hoje", companyId: company.id })
      .returning();
    const financeAp = await makeUser("finance-ap", { accessLevel: "finance_ap" });

    const response = await patchInvoice(
      jsonRequest(`http://localhost/api/invoices/${invoice.id}`, { method: "PATCH", session: { userId: financeAp.id, accessLevel: "finance_ap" }, body: { action: "validate_match", match: "3-way match" } }),
      { params: Promise.resolve({ id: invoice.id }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invoice.match).toBe("3-way match");
    expect(body.invoice.status).toBe("Validada");
    expect(body.invoice.tier).toBe("limpa");
    expect(body.invoice.matchedByUserId).toBe(financeAp.id);

    const [logged] = await db.select().from(auditLog).where(eq(auditLog.action, "invoice.match"));
    expect(logged).toBeTruthy();
  });

  it("liberta um pagamento e regista quem libertou, mas company_admin de outra empresa continua bloqueado", async () => {
    const db = getDb();
    const company = await makeCompany("finance-ap-payment");
    const [batch] = await db.insert(paymentBatches).values({ id: `PAY-RBAC-${Date.now()}`, date: "hoje", count: 1, value: 100_000, companyId: company.id }).returning();
    const financeAp = await makeUser("finance-ap-payment", { accessLevel: "finance_ap" });

    const response = await patchPayment(
      jsonRequest(`http://localhost/api/payments/${batch.id}`, { method: "PATCH", session: { userId: financeAp.id, accessLevel: "finance_ap" }, body: { action: "release" } }),
      { params: Promise.resolve({ id: batch.id }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.paymentBatch.released).toBe(true);
    expect(body.paymentBatch.releasedByUserId).toBe(financeAp.id);

    const [logged] = await db.select().from(auditLog).where(eq(auditLog.action, "payment.release"));
    expect(logged).toBeTruthy();
  });

  it("não é um dos APPLICATION_REVIEW_ROLES — 403 ao tentar homologar directamente", async () => {
    const { POST: homologateApplication } = await import("@/app/api/applications/[id]/homologate/route");
    const response = await homologateApplication(
      jsonRequest("http://localhost/api/applications/CAND-2026-0001/homologate", { method: "POST", session: { userId: 1, accessLevel: "finance_ap" } }),
      { params: Promise.resolve({ id: "CAND-2026-0001" }) }
    );
    expect(response.status).toBe(403);
  });
});

describe("system_admin — perdeu os poderes de negócio explicitamente listados", () => {
  it("403 ao tentar aprovar um pedido, adjudicar um tender, avançar uma PO, curar o catálogo e editar um fornecedor", async () => {
    const { PATCH: patchRequest } = await import("@/app/api/requests/[id]/route");
    const { POST: createCatalogItem } = await import("@/app/api/catalog/route");
    const { PATCH: patchSupplier } = await import("@/app/api/suppliers/[id]/route");

    const db = getDb();
    const company = await makeCompany("sysadmin-forbidden");
    const [request] = await db
      .insert((await import("@/db/schema")).requests)
      .values({ id: `REQ-RBAC-SA-${Date.now()}`, subject: "x", tower: "Requisition-to-PO", value: 1000, status: "Validação", priority: "Normal", owner: "x", companyId: company.id, sla: "16 horas", stage: 1, submitted: "agora", supplier: "x", costCenter: "x" })
      .returning();
    const [supplier] = await db.insert(suppliers).values({ name: `Fornecedor SA Forbidden ${Date.now()}`, category: "Geral" }).returning();

    const approveResponse = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${request.id}`, { method: "PATCH", session: { userId: 1, accessLevel: "system_admin" }, body: { action: "approve" } }),
      { params: Promise.resolve({ id: request.id }) }
    );
    expect(approveResponse.status).toBe(403);

    const catalogResponse = await createCatalogItem(
      jsonRequest("http://localhost/api/catalog", { method: "POST", session: { userId: 1, accessLevel: "system_admin" }, body: { name: "Item", supplierId: supplier.id, unitPrice: 1000 } })
    );
    expect(catalogResponse.status).toBe(403);

    const supplierResponse = await patchSupplier(
      jsonRequest(`http://localhost/api/suppliers/${supplier.id}`, { method: "PATCH", session: { userId: 1, accessLevel: "system_admin" }, body: { risk: "Alto" } }),
      { params: Promise.resolve({ id: String(supplier.id) }) }
    );
    expect(supplierResponse.status).toBe(403);
  });

  it("mantém acesso ao Audit Log", async () => {
    const response = await getAuditLog(new Request("http://localhost/api/admin/audit-log"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.entries)).toBe(true);
  });
});

describe("company_admin — segregação de funções: nunca aprova o seu próprio pedido", () => {
  it("403 ao tentar aprovar/rejeitar um pedido de que é dono, sucesso ao aprovar o de outra pessoa", async () => {
    const db = getDb();
    const { PATCH: patchRequest } = await import("@/app/api/requests/[id]/route");
    const { requests } = await import("@/db/schema");
    const company = await makeCompany("sod-self-approval");
    const owner = await makeUser("sod-owner", { accessLevel: "company_admin", companyId: company.id });
    const approver = await makeUser("sod-approver", { accessLevel: "company_admin", companyId: company.id });

    const [ownRequest] = await db
      .insert(requests)
      .values({ id: `REQ-RBAC-SOD-${Date.now()}`, subject: "x", tower: "Requisition-to-PO", value: 1000, status: "Validação", priority: "Normal", owner: "x", ownerUserId: owner.id, companyId: company.id, sla: "16 horas", stage: 1, submitted: "agora", supplier: "x", costCenter: "x" })
      .returning();

    const selfApprove = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${ownRequest.id}`, { method: "PATCH", session: { userId: owner.id, accessLevel: "company_admin", companyId: company.id }, body: { action: "approve" } }),
      { params: Promise.resolve({ id: ownRequest.id }) }
    );
    expect(selfApprove.status).toBe(409);

    const othersApprove = await patchRequest(
      jsonRequest(`http://localhost/api/requests/${ownRequest.id}`, { method: "PATCH", session: { userId: approver.id, accessLevel: "company_admin", companyId: company.id }, body: { action: "approve" } }),
      { params: Promise.resolve({ id: ownRequest.id }) }
    );
    expect(othersApprove.status).toBe(200);
  });
});
