import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, invoices, paymentBatches, suppliers } from "@/db/schema";
import { GET as exportIso20022 } from "@/app/api/payments/[id]/export/iso20022/route";

async function makeCompany(label: string, bankDetails?: { iban: string; bic: string }) {
  const db = getDb();
  const [company] = await db
    .insert(companies)
    .values({ name: `Empresa Export ${label}`, domain: uniqueDomain(`iso20022-${label}`), ...bankDetails })
    .returning();
  return company;
}

async function makeSupplier(label: string, bankDetails?: { iban: string; bic: string }) {
  const db = getDb();
  const [supplier] = await db.insert(suppliers).values({ name: `Fornecedor Export ${label} ${Date.now()}`, category: "Geral", ...bankDetails }).returning();
  return supplier;
}

async function makeBatch(companyId: number) {
  const db = getDb();
  const [batch] = await db
    .insert(paymentBatches)
    .values({ id: `PAY-ISO-${companyId}-${Date.now()}`, date: "hoje", count: 1, value: 1000, status: "Pronto", released: false, companyId })
    .returning();
  return batch;
}

describe("GET /api/payments/:id/export/iso20022", () => {
  it("404s for an unknown batch", async () => {
    const response = await exportIso20022(
      jsonRequest("http://localhost/api/payments/DOES-NOT-EXIST/export/iso20022", { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }),
      { params: Promise.resolve({ id: "DOES-NOT-EXIST" }) }
    );
    expect(response.status).toBe(404);
  });

  it("blocks a company_admin from another company's batch", async () => {
    const company = await makeCompany("Alheio", { iban: "AO0600...", bic: "AAA" });
    const otherCompany = await makeCompany("Outro");
    const batch = await makeBatch(company.id);

    const response = await exportIso20022(
      jsonRequest(`http://localhost/api/payments/${batch.id}/export/iso20022`, {
        method: "GET",
        session: { userId: 1, accessLevel: "company_admin", companyId: otherCompany.id },
      }),
      { params: Promise.resolve({ id: batch.id }) }
    );
    expect(response.status).toBe(403);
  });

  it("refuses when the company has no IBAN/BIC configured", async () => {
    const company = await makeCompany("SemConta");
    const batch = await makeBatch(company.id);

    const response = await exportIso20022(
      jsonRequest(`http://localhost/api/payments/${batch.id}/export/iso20022`, { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }),
      { params: Promise.resolve({ id: batch.id }) }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("IBAN/BIC da empresa");
  });

  it("refuses when there are no validated invoices to export", async () => {
    const company = await makeCompany("SemFacturas", { iban: "AO0600...", bic: "AAA" });
    const batch = await makeBatch(company.id);

    const response = await exportIso20022(
      jsonRequest(`http://localhost/api/payments/${batch.id}/export/iso20022`, { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }),
      { params: Promise.resolve({ id: batch.id }) }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("facturas validadas");
  });

  it("refuses and lists the invoice when the invoice's supplier has no IBAN/BIC", async () => {
    const company = await makeCompany("FornecedorSemConta", { iban: "AO0600...", bic: "AAA" });
    const supplier = await makeSupplier("SemConta");
    const db = getDb();
    const [invoice] = await db
      .insert(invoices)
      .values({ id: `FT-ISO-${Date.now()}`, supplier: supplier.name, po: "PO-1", value: 5000, match: "3-way match", status: "Validada", due: "hoje", companyId: company.id, supplierId: supplier.id })
      .returning();
    const batch = await makeBatch(company.id);

    const response = await exportIso20022(
      jsonRequest(`http://localhost/api/payments/${batch.id}/export/iso20022`, { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }),
      { params: Promise.resolve({ id: batch.id }) }
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.invoiceIds).toContain(invoice.id);
  });

  it("generates a valid pain.001 XML for a company and supplier with bank details, only including validated invoices", async () => {
    const company = await makeCompany("Completa", { iban: "AO06004000000123456789101", bic: "BAOAAOLU" });
    const supplier = await makeSupplier("ComConta", { iban: "AO06004000000198765432101", bic: "BFAAAOLU" });
    const db = getDb();
    const [validatedInvoice] = await db
      .insert(invoices)
      .values({ id: `FT-ISO-VALID-${Date.now()}`, supplier: supplier.name, po: "PO-1", value: 42_000, match: "3-way match", status: "Validada", due: "hoje", companyId: company.id, supplierId: supplier.id })
      .returning();
    // Não validada — nunca deve aparecer no ficheiro.
    await db.insert(invoices).values({ id: `FT-ISO-PENDING-${Date.now()}`, supplier: supplier.name, po: "PO-2", value: 9_000, match: "Receção em falta", status: "Pendente", due: "hoje", companyId: company.id, supplierId: supplier.id });
    const batch = await makeBatch(company.id);

    const response = await exportIso20022(
      jsonRequest(`http://localhost/api/payments/${batch.id}/export/iso20022`, {
        method: "GET",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
      }),
      { params: Promise.resolve({ id: batch.id }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(response.headers.get("content-disposition")).toContain(`pain001-${batch.id}.xml`);

    const xml = await response.text();
    expect(xml).toContain("<NbOfTxs>1</NbOfTxs>");
    expect(xml).toContain(`<EndToEndId>${validatedInvoice.id}</EndToEndId>`);
    expect(xml).toContain("<IBAN>AO06004000000198765432101</IBAN>");
    expect(xml).toContain('<InstdAmt Ccy="AOA">42000.00</InstdAmt>');
    expect(xml).not.toContain("FT-ISO-PENDING");
  });
});
