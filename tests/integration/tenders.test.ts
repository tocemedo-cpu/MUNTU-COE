import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { bids, companies, purchaseOrders, suppliers, users } from "@/db/schema";
import { GET as listTenders, POST as createTender } from "@/app/api/tenders/route";
import { GET as getTender, PATCH as patchTender } from "@/app/api/tenders/[id]/route";
import { POST as submitBid } from "@/app/api/tenders/[id]/bids/route";
import { POST as awardTender } from "@/app/api/tenders/[id]/award/route";

// tenders.created_by_user_id tem uma FK real para users.id — precisa de
// apontar para uma linha real (mesma razão de tests/integration/applications.test.ts#makeReviewer).
async function makeBuyer(companyId: number) {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      name: `Comprador ${Date.now()}-${Math.random()}`,
      email: `buyer-${Date.now()}-${Math.random()}@example.com`,
      role: "Administrador da empresa",
      initials: "CP",
      companyId,
      accessLevel: "company_admin",
    })
    .returning();
  return user;
}

async function makeCompany() {
  const db = getDb();
  const [company] = await db.insert(companies).values({ name: `Empresa Tender ${Date.now()}`, domain: uniqueDomain("tender") }).returning();
  return company;
}

async function makeSupplier(name: string) {
  const db = getDb();
  const [supplier] = await db.insert(suppliers).values({ name, category: "Geral" }).returning();
  return supplier;
}

describe("POST/GET /api/tenders", () => {
  it("creates a tender scoped to the company_admin's own company and invites the given suppliers", async () => {
    const company = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const supplierA = await makeSupplier(`Fornecedor A ${Date.now()}`);
    const supplierB = await makeSupplier(`Fornecedor B ${Date.now()}`);

    const response = await createTender(
      jsonRequest("http://localhost/api/tenders", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Fornecimento de EPI",
          description: "Capacetes e luvas para o Q3",
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          supplierIds: [supplierA.id, supplierB.id],
        },
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.tender.id).toMatch(/^RFQ-2026-\d{4}$/);
    expect(body.tender.companyId).toBe(company.id);
    expect(body.tender.status).toBe("aberto");
  });

  it("ignores a companyId in the body from a company_admin — always scoped to their own session company", async () => {
    const company = await makeCompany();
    const otherCompany = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const supplier = await makeSupplier(`Fornecedor C ${Date.now()}`);

    const response = await createTender(
      jsonRequest("http://localhost/api/tenders", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Tentativa de fuga de âmbito",
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          companyId: otherCompany.id,
          supplierIds: [supplier.id],
        },
      })
    );

    const body = await response.json();
    expect(body.tender.companyId).toBe(company.id);
  });

  it("a supplier only ever sees tenders for which it was invited, never the full sourcing list", async () => {
    const company = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const invitedSupplier = await makeSupplier(`Convidado ${Date.now()}`);
    const outsiderSupplier = await makeSupplier(`De fora ${Date.now()}`);

    await createTender(
      jsonRequest("http://localhost/api/tenders", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Só para o convidado",
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          supplierIds: [invitedSupplier.id],
        },
      })
    );

    const invitedResponse = await listTenders(
      jsonRequest("http://localhost/api/tenders", { method: "GET", session: { userId: 1, accessLevel: "supplier", supplierId: invitedSupplier.id } })
    );
    const invitedBody = await invitedResponse.json();
    expect(invitedBody.tenders.length).toBeGreaterThanOrEqual(1);

    const outsiderResponse = await listTenders(
      jsonRequest("http://localhost/api/tenders", { method: "GET", session: { userId: 1, accessLevel: "supplier", supplierId: outsiderSupplier.id } })
    );
    const outsiderBody = await outsiderResponse.json();
    expect(outsiderBody.tenders).toEqual([]);
  });
});

describe("GET /api/tenders/:id — a fornecedor never sees a competitor's bid", () => {
  it("only returns the caller supplier's own bid, hiding other suppliers' proposals", async () => {
    const company = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const supplierA = await makeSupplier(`Proponente A ${Date.now()}`);
    const supplierB = await makeSupplier(`Proponente B ${Date.now()}`);

    const createResponse = await createTender(
      jsonRequest("http://localhost/api/tenders", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Sourcing com duas propostas",
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          supplierIds: [supplierA.id, supplierB.id],
        },
      })
    );
    const { tender } = await createResponse.json();

    await submitBid(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/bids`, {
        method: "POST",
        session: { userId: 1, accessLevel: "supplier", supplierId: supplierA.id },
        body: { value: 500_000 },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    await submitBid(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/bids`, {
        method: "POST",
        session: { userId: 1, accessLevel: "supplier", supplierId: supplierB.id },
        body: { value: 480_000 },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );

    const detailForA = await getTender(
      jsonRequest(`http://localhost/api/tenders/${tender.id}`, { method: "GET", session: { userId: 1, accessLevel: "supplier", supplierId: supplierA.id } }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    const bodyForA = await detailForA.json();
    expect(bodyForA.myBid.value).toBe(500_000);
    expect(bodyForA.bids).toBeUndefined();

    const detailForBuyer = await getTender(
      jsonRequest(`http://localhost/api/tenders/${tender.id}`, { method: "GET", session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id } }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    const bodyForBuyer = await detailForBuyer.json();
    expect(bodyForBuyer.bids).toHaveLength(2);
  });
});

describe("POST /api/tenders/:id/bids", () => {
  it("rejects a bid from a supplier that was never invited to the tender", async () => {
    const company = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const invitedSupplier = await makeSupplier(`Convidado bid ${Date.now()}`);
    const outsiderSupplier = await makeSupplier(`Fora bid ${Date.now()}`);

    const createResponse = await createTender(
      jsonRequest("http://localhost/api/tenders", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Tender fechado a estranhos",
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          supplierIds: [invitedSupplier.id],
        },
      })
    );
    const { tender } = await createResponse.json();

    const response = await submitBid(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/bids`, {
        method: "POST",
        session: { userId: 1, accessLevel: "supplier", supplierId: outsiderSupplier.id },
        body: { value: 100 },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );

    expect(response.status).toBe(403);
  });

  it("resubmitting replaces the previous bid instead of creating a second row", async () => {
    const company = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const supplier = await makeSupplier(`Reenvio ${Date.now()}`);

    const createResponse = await createTender(
      jsonRequest("http://localhost/api/tenders", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Tender com correcção de proposta",
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          supplierIds: [supplier.id],
        },
      })
    );
    const { tender } = await createResponse.json();

    await submitBid(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/bids`, {
        method: "POST",
        session: { userId: 1, accessLevel: "supplier", supplierId: supplier.id },
        body: { value: 1000 },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    await submitBid(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/bids`, {
        method: "POST",
        session: { userId: 1, accessLevel: "supplier", supplierId: supplier.id },
        body: { value: 800 },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );

    const db = getDb();
    const rows = await db.select().from(bids).where(eq(bids.tenderId, tender.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(800);
  });
});

describe("POST /api/tenders/:id/award", () => {
  it("marks the winning bid, rejects the rest, closes the tender and creates a linked PO", async () => {
    const company = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const winner = await makeSupplier(`Vencedor ${Date.now()}`);
    const loser = await makeSupplier(`Perdedor ${Date.now()}`);

    const createResponse = await createTender(
      jsonRequest("http://localhost/api/tenders", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Tender a adjudicar",
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          supplierIds: [winner.id, loser.id],
        },
      })
    );
    const { tender } = await createResponse.json();

    const winnerBidResponse = await submitBid(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/bids`, {
        method: "POST",
        session: { userId: 1, accessLevel: "supplier", supplierId: winner.id },
        body: { value: 900_000 },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    const { bid: winnerBid } = await winnerBidResponse.json();
    await submitBid(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/bids`, {
        method: "POST",
        session: { userId: 1, accessLevel: "supplier", supplierId: loser.id },
        body: { value: 950_000 },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );

    const awardResponse = await awardTender(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/award`, {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: { bidId: winnerBid.id },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );

    expect(awardResponse.status).toBe(201);
    const awardBody = await awardResponse.json();
    expect(awardBody.tender.status).toBe("adjudicado");
    expect(awardBody.tender.awardedBidId).toBe(winnerBid.id);
    expect(awardBody.po.tier).toBe("complexo");
    expect(awardBody.po.value).toBe(900_000);
    expect(awardBody.po.companyId).toBe(company.id);

    const db = getDb();
    const bidRows = await db.select().from(bids).where(eq(bids.tenderId, tender.id));
    expect(bidRows.find((b) => b.id === winnerBid.id)?.status).toBe("vencedora");
    expect(bidRows.find((b) => b.id !== winnerBid.id)?.status).toBe("rejeitada");

    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, awardBody.po.id));
    expect(po.supplierId).toBe(winner.id);

    // Um tender já adjudicado não pode voltar a receber propostas.
    const lateBid = await submitBid(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/bids`, {
        method: "POST",
        session: { userId: 1, accessLevel: "supplier", supplierId: winner.id },
        body: { value: 1 },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    expect(lateBid.status).toBe(400);
  });
});

describe("PATCH /api/tenders/:id (cancel)", () => {
  it("cancels an open tender, and blocks cross-company access", async () => {
    const company = await makeCompany();
    const otherCompany = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const outsiderBuyer = await makeBuyer(otherCompany.id);
    const supplier = await makeSupplier(`Cancelamento ${Date.now()}`);

    const createResponse = await createTender(
      jsonRequest("http://localhost/api/tenders", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Tender a cancelar",
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          supplierIds: [supplier.id],
        },
      })
    );
    const { tender } = await createResponse.json();

    const forbidden = await patchTender(
      jsonRequest(`http://localhost/api/tenders/${tender.id}`, {
        method: "PATCH",
        session: { userId: outsiderBuyer.id, accessLevel: "company_admin", companyId: otherCompany.id },
        body: { action: "cancel" },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    expect(forbidden.status).toBe(403);

    const cancelled = await patchTender(
      jsonRequest(`http://localhost/api/tenders/${tender.id}`, {
        method: "PATCH",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: { action: "cancel" },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    const cancelledBody = await cancelled.json();
    expect(cancelledBody.tender.status).toBe("cancelado");
  });
});

// Bloqueio por risco alto (lib/risk-block.ts) — mesma regra da aprovação
// de um pedido, aqui aplicada à adjudicação de uma proposta.
describe("POST /api/tenders/:id/award — bloqueio por risco alto", () => {
  it("blocks a company_admin outright, even trying overrideRisk, without touching the tender", async () => {
    const company = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const db = getDb();
    const [riskySupplier] = await db.insert(suppliers).values({ name: `Fornecedor Risco Alto ${Date.now()}`, category: "Geral", risk: "Alto" }).returning();

    const createResponse = await createTender(
      jsonRequest("http://localhost/api/tenders", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Tender com fornecedor de risco",
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          supplierIds: [riskySupplier.id],
        },
      })
    );
    const { tender } = await createResponse.json();

    const bidResponse = await submitBid(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/bids`, {
        method: "POST",
        session: { userId: 1, accessLevel: "supplier", supplierId: riskySupplier.id },
        body: { value: 100_000 },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    const { bid } = await bidResponse.json();

    const response = await awardTender(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/award`, {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: { bidId: bid.id, overrideRisk: true },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.riskBlock).toBe(true);
    expect(body.canOverride).toBe(false);

    const [unchangedBid] = await db.select().from(bids).where(eq(bids.id, bid.id));
    expect(unchangedBid.status).toBe("submetida");
  });

  it("lets system_admin through with overrideRisk, marking the resulting PO as overridden", async () => {
    const company = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const db = getDb();
    const [riskySupplier] = await db.insert(suppliers).values({ name: `Fornecedor Risco Alto B ${Date.now()}`, category: "Geral", risk: "Alto" }).returning();
    const [admin] = await db
      .insert(users)
      .values({ name: `Admin ${Date.now()}`, email: `sla-admin-${Date.now()}@example.com`, role: "System Admin", initials: "SA", accessLevel: "system_admin" })
      .returning();

    const createResponse = await createTender(
      jsonRequest("http://localhost/api/tenders", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Tender com fornecedor de risco, com override",
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          supplierIds: [riskySupplier.id],
        },
      })
    );
    const { tender } = await createResponse.json();

    const bidResponse = await submitBid(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/bids`, {
        method: "POST",
        session: { userId: 1, accessLevel: "supplier", supplierId: riskySupplier.id },
        body: { value: 200_000 },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    const { bid } = await bidResponse.json();

    const blocked = await awardTender(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/award`, {
        method: "POST",
        session: { userId: admin.id, accessLevel: "system_admin" },
        body: { bidId: bid.id },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    expect(blocked.status).toBe(409);

    const overridden = await awardTender(
      jsonRequest(`http://localhost/api/tenders/${tender.id}/award`, {
        method: "POST",
        session: { userId: admin.id, accessLevel: "system_admin" },
        body: { bidId: bid.id, overrideRisk: true },
      }),
      { params: Promise.resolve({ id: tender.id }) }
    );
    expect(overridden.status).toBe(201);
    const overriddenBody = await overridden.json();
    expect(overriddenBody.po.riskOverriddenByUserId).toBe(admin.id);
    expect(overriddenBody.po.riskOverriddenAt).not.toBeNull();
  });
});
