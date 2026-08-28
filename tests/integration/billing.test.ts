import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { seedIfEmpty } from "@/db/seed-data";
import { clientInvoiceLines, companies, invoices, purchaseOrders } from "@/db/schema";
import { POST as generateBilling } from "@/app/api/admin/billing/route";

describe("POST /api/admin/billing (gerar factura de cliente)", () => {
  beforeAll(async () => {
    // billing_rates é usado pelo motor de facturação; seedIfEmpty semeia-o
    // com os valores do Estudo de Viabilidade (idempotente).
    await seedIfEmpty(getDb());
  });

  it("sums retainer + PO tiers + invoice tiers into the right totals", async () => {
    const db = getDb();
    const [company] = await db
      .insert(companies)
      .values({ name: "Cliente Facturação", domain: uniqueDomain("billing"), retainerAmount: 200_000 })
      .returning();

    await db.insert(purchaseOrders).values([
      { id: `PO-TEST-${company.id}-1`, supplier: "Fornecedor A", description: "Item A", value: 1, status: "Confirmado", companyId: company.id, tier: "standard" },
      { id: `PO-TEST-${company.id}-2`, supplier: "Fornecedor B", description: "Item B", value: 1, status: "Confirmado", companyId: company.id, tier: "complexo" },
    ]);
    await db.insert(invoices).values([
      { id: `FT-TEST-${company.id}-1`, supplier: "Fornecedor A", po: `PO-TEST-${company.id}-1`, value: 1, match: "3-way match", status: "Validada", due: "hoje", companyId: company.id, tier: "limpa" },
      { id: `FT-TEST-${company.id}-2`, supplier: "Fornecedor B", po: `PO-TEST-${company.id}-2`, value: 1, match: "Preço divergente", status: "Excepção", due: "hoje", companyId: company.id, tier: "excecao" },
    ]);

    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const response = await generateBilling(
      jsonRequest("http://localhost/api/admin/billing", {
        method: "POST",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { companyId: company.id, periodStart, periodEnd, scope: "total" },
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();

    expect(body.clientInvoice.retainerAmount).toBe(200_000);
    expect(body.clientInvoice.companyName).toBe("Cliente Facturação");
    expect(body.clientInvoice.status).toBe("pendente_aprovacao");
    expect(body.clientInvoice.totalAmount).toBe(
      body.clientInvoice.retainerAmount + body.clientInvoice.poAmount + body.clientInvoice.invoiceAmount
    );
    expect(body.clientInvoice.poAmount).toBeGreaterThan(0);
    expect(body.clientInvoice.invoiceAmount).toBeGreaterThan(0);

    const lines = await db.select().from(clientInvoiceLines).where(eq(clientInvoiceLines.clientInvoiceId, body.clientInvoice.id));
    expect(lines).toHaveLength(5); // 1 retainer + 2 PO + 2 invoice
    expect(lines.filter((l) => l.kind === "po").map((l) => l.tier).sort()).toEqual(["complexo", "standard"]);
    expect(lines.filter((l) => l.kind === "invoice").map((l) => l.tier).sort()).toEqual(["excecao", "limpa"]);
  });

  it("omits the retainer line entirely when the company has no retainer set", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Cliente Sem Retainer", domain: uniqueDomain("billing-no-retainer") }).returning();
    await db.insert(purchaseOrders).values({
      id: `PO-TEST-${company.id}-1`,
      supplier: "Fornecedor C",
      description: "Item C",
      value: 1,
      status: "Confirmado",
      companyId: company.id,
      tier: "automatico",
    });

    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const response = await generateBilling(
      jsonRequest("http://localhost/api/admin/billing", {
        method: "POST",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { companyId: company.id, periodStart, periodEnd, scope: "total" },
      })
    );
    const body = await response.json();
    expect(body.clientInvoice.retainerAmount).toBe(0);

    const lines = await db.select().from(clientInvoiceLines).where(eq(clientInvoiceLines.clientInvoiceId, body.clientInvoice.id));
    expect(lines.some((l) => l.kind === "retainer")).toBe(false);
  });

  it("404s when the company does not exist", async () => {
    const response = await generateBilling(
      jsonRequest("http://localhost/api/admin/billing", {
        method: "POST",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { companyId: 999_999_999, periodStart: "2026-01-01", periodEnd: "2026-01-31", scope: "total" },
      })
    );
    expect(response.status).toBe(404);
  });
});
