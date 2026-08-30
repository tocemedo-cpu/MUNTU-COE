import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, purchaseOrders } from "@/db/schema";
import { GET as exportSap } from "@/app/api/purchase-orders/export/sap/route";

async function makeCompany(label: string) {
  const db = getDb();
  const [company] = await db.insert(companies).values({ name: `Empresa SAP ${label}`, domain: uniqueDomain(`sap-${label}`) }).returning();
  return company;
}

async function makePo(companyId: number, params: { id: string; createdAt: Date; value?: number }) {
  const db = getDb();
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      id: params.id,
      supplier: "Fornecedor Teste",
      description: "Peças de reposição",
      value: params.value ?? 1000,
      status: "Confirmado",
      companyId,
      tier: "standard",
      createdAt: params.createdAt,
    })
    .returning();
  return po;
}

describe("GET /api/purchase-orders/export/sap", () => {
  it("refuses a supplier — the export is for the client company's own ERP, not a supplier's", async () => {
    const response = await exportSap(
      jsonRequest("http://localhost/api/purchase-orders/export/sap?periodStart=2026-01-01&periodEnd=2026-01-31", {
        method: "GET",
        session: { userId: 1, accessLevel: "supplier", supplierId: 1 },
      })
    );
    expect(response.status).toBe(403);
  });

  it("400s a company_admin whose session has no company", async () => {
    const response = await exportSap(
      jsonRequest("http://localhost/api/purchase-orders/export/sap?periodStart=2026-01-01&periodEnd=2026-01-31", {
        method: "GET",
        session: { userId: 1, accessLevel: "company_admin", companyId: null },
      })
    );
    expect(response.status).toBe(400);
  });

  it("400s an internal role that omits companyId", async () => {
    const response = await exportSap(
      jsonRequest("http://localhost/api/purchase-orders/export/sap?periodStart=2026-01-01&periodEnd=2026-01-31", {
        method: "GET",
        session: { userId: 1, accessLevel: "system_admin" },
      })
    );
    expect(response.status).toBe(400);
  });

  it("400s on a missing or inverted period", async () => {
    const company = await makeCompany("Periodo");
    const missing = await exportSap(
      jsonRequest("http://localhost/api/purchase-orders/export/sap", { method: "GET", session: { userId: 1, accessLevel: "company_admin", companyId: company.id } })
    );
    expect(missing.status).toBe(400);

    const inverted = await exportSap(
      jsonRequest("http://localhost/api/purchase-orders/export/sap?periodStart=2026-02-01&periodEnd=2026-01-01", {
        method: "GET",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
      })
    );
    expect(inverted.status).toBe(400);
  });

  it("400s when there are no purchase orders in the period", async () => {
    const company = await makeCompany("SemPOs");
    const response = await exportSap(
      jsonRequest("http://localhost/api/purchase-orders/export/sap?periodStart=2020-01-01&periodEnd=2020-01-31", {
        method: "GET",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
      })
    );
    expect(response.status).toBe(400);
  });

  it("a company_admin always exports their own company, ignoring any companyId in the query", async () => {
    const company = await makeCompany("Propria");
    const otherCompany = await makeCompany("Alheia");
    const inScope = await makePo(company.id, { id: `PO-SAP-${Date.now()}-A`, createdAt: new Date("2026-05-15T00:00:00Z"), value: 500_000 });
    await makePo(otherCompany.id, { id: `PO-SAP-${Date.now()}-B`, createdAt: new Date("2026-05-15T00:00:00Z") });

    const response = await exportSap(
      jsonRequest(`http://localhost/api/purchase-orders/export/sap?periodStart=2026-05-01&periodEnd=2026-05-31&companyId=${otherCompany.id}`, {
        method: "GET",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("sap-po-export-2026-05-01-2026-05-31.csv");
    const csv = await response.text();
    expect(csv).toContain(inScope.id);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2); // header + 1 row, never the other company's PO
  });

  it("excludes purchase orders outside the requested period", async () => {
    const company = await makeCompany("ForaDoPeriodo");
    const inside = await makePo(company.id, { id: `PO-SAP-${Date.now()}-IN`, createdAt: new Date("2026-06-15T12:00:00Z") });
    await makePo(company.id, { id: `PO-SAP-${Date.now()}-OUT`, createdAt: new Date("2026-07-01T00:00:00Z") });

    const response = await exportSap(
      jsonRequest("http://localhost/api/purchase-orders/export/sap?periodStart=2026-06-01&periodEnd=2026-06-30", {
        method: "GET",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
      })
    );

    const csv = await response.text();
    expect(csv).toContain(inside.id);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
  });

  it("a system_admin exports any company given companyId", async () => {
    const company = await makeCompany("ViaAdmin");
    const po = await makePo(company.id, { id: `PO-SAP-${Date.now()}-ADMIN`, createdAt: new Date("2026-08-10T00:00:00Z") });

    const response = await exportSap(
      jsonRequest(`http://localhost/api/purchase-orders/export/sap?periodStart=2026-08-01&periodEnd=2026-08-31&companyId=${company.id}`, {
        method: "GET",
        session: { userId: 1, accessLevel: "system_admin" },
      })
    );

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("CompanyCode,PurchasingDocument,DocumentDate,ItemNumber,VendorName,ShortText,Currency,NetOrderValue,POStatus,Tier");
    expect(csv).toContain(po.id);
    expect(csv).toContain("000010");
    expect(csv).toContain("AOA");
  });
});
