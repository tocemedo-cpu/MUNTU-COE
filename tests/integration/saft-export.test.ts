import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, uniqueDomain } from "./helpers";
import { clientInvoices, companies } from "@/db/schema";
import { GET as exportSaft } from "@/app/api/admin/billing/export/saft/route";

function saftRequest(periodStart: string, periodEnd: string) {
  return new Request(`http://localhost/api/admin/billing/export/saft?periodStart=${periodStart}&periodEnd=${periodEnd}`, { method: "GET" });
}

async function makeCompany(label: string, taxId?: string) {
  const db = getDb();
  const [company] = await db.insert(companies).values({ name: `Empresa SAF-T ${label}`, domain: uniqueDomain(`saft-${label}`), taxId }).returning();
  return company;
}

async function makeClientInvoice(companyId: number, params: { periodStart: string; periodEnd: string; status: string; totalAmount: number }) {
  const db = getDb();
  const [invoice] = await db
    .insert(clientInvoices)
    .values({
      id: `COB-SAFT-${companyId}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      companyId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      status: params.status,
      totalAmount: params.totalAmount,
    })
    .returning();
  return invoice;
}

const ORIGINAL_MUNTU_NIF = process.env.MUNTU_NIF;

describe("GET /api/admin/billing/export/saft", () => {
  beforeEach(() => {
    process.env.MUNTU_NIF = "5417000123";
  });
  afterEach(() => {
    process.env.MUNTU_NIF = ORIGINAL_MUNTU_NIF;
  });

  it("refuses when MUNTU_NIF is not configured", async () => {
    delete process.env.MUNTU_NIF;
    const response = await exportSaft(saftRequest("2026-01-01", "2026-01-31"));
    expect(response.status).toBe(501);
  });

  it("400s on a missing or invalid period", async () => {
    const noParams = await exportSaft(new Request("http://localhost/api/admin/billing/export/saft", { method: "GET" }));
    expect(noParams.status).toBe(400);

    const invertedRange = await exportSaft(saftRequest("2026-02-01", "2026-01-01"));
    expect(invertedRange.status).toBe(400);
  });

  it("refuses when there are no approved client invoices in the period", async () => {
    const response = await exportSaft(saftRequest("2020-01-01", "2020-01-31"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("facturas aprovadas");
  });

  it("refuses and lists the company when a billed company has no NIF configured", async () => {
    const company = await makeCompany("SemNif");
    await makeClientInvoice(company.id, { periodStart: "2026-03-01", periodEnd: "2026-03-31", status: "aprovada", totalAmount: 1_140_000 });

    const response = await exportSaft(saftRequest("2026-03-01", "2026-03-31"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.companyIds).toContain(company.id);
  });

  it("generates a valid SAF-T XML covering only approved/sent invoices in the period, for companies with a NIF", async () => {
    const company = await makeCompany("Completa", "5417999888");
    const invoice = await makeClientInvoice(company.id, { periodStart: "2026-04-01", periodEnd: "2026-04-30", status: "aprovada", totalAmount: 1_140_000 });
    // Pendente — nunca deve entrar no ficheiro.
    await makeClientInvoice(company.id, { periodStart: "2026-04-01", periodEnd: "2026-04-30", status: "pendente_aprovacao", totalAmount: 500_000 });

    const response = await exportSaft(saftRequest("2026-04-01", "2026-04-30"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(response.headers.get("content-disposition")).toContain("saft-agt-2026-04-01-2026-04-30.xml");

    const xml = await response.text();
    expect(xml).toContain(`<InvoiceNo>${invoice.id}</InvoiceNo>`);
    expect(xml).toContain("<CustomerTaxID>5417999888</CustomerTaxID>");
    expect(xml).toContain("<GrossTotal>1140000.00</GrossTotal>");
    expect(xml).toContain("<NumberOfEntries>1</NumberOfEntries>");
  });
});
