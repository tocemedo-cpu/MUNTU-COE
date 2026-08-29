import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, uniqueDomain } from "./helpers";
import { companies, exceptions, paymentBatches, purchaseOrders, suppliers, users } from "@/db/schema";
import { POST as runPaymentRelease } from "@/app/api/admin/payment-release/run/route";

function cronRequest(secretHeader?: string) {
  const headers: HeadersInit = { "content-type": "application/json" };
  if (secretHeader !== undefined) headers["x-cron-secret"] = secretHeader;
  return new Request("http://localhost/api/admin/payment-release/run", { method: "POST", headers });
}

async function makeCompany(label: string) {
  const db = getDb();
  const [company] = await db.insert(companies).values({ name: `Empresa Pagamento ${label}`, domain: uniqueDomain(`payment-release-${label}`) }).returning();
  return company;
}

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("POST /api/admin/payment-release/run", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });
  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  it("refuses without a valid secret", async () => {
    delete process.env.CRON_SECRET;
    expect((await runPaymentRelease(cronRequest("x"))).status).toBe(501);
    process.env.CRON_SECRET = "test-cron-secret";
    expect((await runPaymentRelease(cronRequest("wrong"))).status).toBe(401);
  });

  it("releases a batch for a company with no open exceptions and no unresolved high-risk PO exposure", async () => {
    const db = getDb();
    const company = await makeCompany("Limpa");
    const [batch] = await db
      .insert(paymentBatches)
      .values({ id: `PAY-TEST-${company.id}`, date: "hoje", count: 1, value: 100_000, status: "Pronto", released: false, companyId: company.id })
      .returning();

    const response = await runPaymentRelease(cronRequest("test-cron-secret"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.released).toBeGreaterThanOrEqual(1);

    const [updated] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, batch.id));
    expect(updated.released).toBe(true);
    expect(updated.status).toBe("Pago");
    expect(updated.autoReleasedAt).not.toBeNull();
  });

  it("never releases a batch while the company has an open exception", async () => {
    const db = getDb();
    const company = await makeCompany("ComExcepcao");
    const [batch] = await db
      .insert(paymentBatches)
      .values({ id: `PAY-TEST-${company.id}`, date: "hoje", count: 1, value: 50_000, status: "Pronto", released: false, companyId: company.id })
      .returning();
    await db.insert(exceptions).values({ id: `EXC-TEST-${company.id}`, title: "Divergência de preço", ref: batch.id, owner: "Teste", impact: "Médio", resolved: false, companyId: company.id });

    await runPaymentRelease(cronRequest("test-cron-secret"));

    const [unchanged] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, batch.id));
    expect(unchanged.released).toBe(false);
    expect(unchanged.autoReleasedAt).toBeNull();
  });

  it("never releases a batch while the company has a PO to a risk-Alto supplier with no override recorded", async () => {
    const db = getDb();
    const company = await makeCompany("ComRisco");
    const [supplier] = await db.insert(suppliers).values({ name: `Fornecedor Risco Pagamento ${Date.now()}`, category: "Geral", risk: "Alto" }).returning();
    await db.insert(purchaseOrders).values({
      id: `PO-TEST-RISK-${company.id}`,
      supplier: supplier.name,
      description: "Serviço de risco",
      value: 10_000,
      status: "Confirmado",
      companyId: company.id,
      supplierId: supplier.id,
    });
    const [batch] = await db
      .insert(paymentBatches)
      .values({ id: `PAY-TEST-${company.id}`, date: "hoje", count: 1, value: 10_000, status: "Pronto", released: false, companyId: company.id })
      .returning();

    await runPaymentRelease(cronRequest("test-cron-secret"));

    const [unchanged] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, batch.id));
    expect(unchanged.released).toBe(false);
  });

  it("does release when the risky PO was explicitly risk-overridden", async () => {
    const db = getDb();
    const company = await makeCompany("RiscoAceite");
    const [supplier] = await db.insert(suppliers).values({ name: `Fornecedor Risco Aceite ${Date.now()}`, category: "Geral", risk: "Alto" }).returning();
    const [admin] = await db.insert(users).values({ name: "Admin Override", email: `override-${Date.now()}@example.com`, role: "System Admin", initials: "AO", accessLevel: "system_admin" }).returning();
    await db.insert(purchaseOrders).values({
      id: `PO-TEST-OVERRIDE-${company.id}`,
      supplier: supplier.name,
      description: "Serviço de risco aceite",
      value: 10_000,
      status: "Confirmado",
      companyId: company.id,
      supplierId: supplier.id,
      riskOverriddenByUserId: admin.id,
      riskOverriddenAt: new Date(),
    });
    const [batch] = await db
      .insert(paymentBatches)
      .values({ id: `PAY-TEST-${company.id}`, date: "hoje", count: 1, value: 10_000, status: "Pronto", released: false, companyId: company.id })
      .returning();

    await runPaymentRelease(cronRequest("test-cron-secret"));

    const [updated] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, batch.id));
    expect(updated.released).toBe(true);
  });

  it("never touches a batch already released", async () => {
    const db = getDb();
    const company = await makeCompany("JaLibertado");
    const [batch] = await db
      .insert(paymentBatches)
      .values({ id: `PAY-TEST-${company.id}`, date: "hoje", count: 1, value: 1, status: "Pago", released: true, companyId: company.id })
      .returning();

    await runPaymentRelease(cronRequest("test-cron-secret"));

    const [unchanged] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, batch.id));
    expect(unchanged.autoReleasedAt).toBeNull();
  });
});
