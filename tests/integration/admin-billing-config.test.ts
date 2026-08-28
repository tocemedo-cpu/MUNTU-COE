import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { seedIfEmpty } from "@/db/seed-data";
import { companies } from "@/db/schema";
import { GET as getBillingRates } from "@/app/api/admin/billing-rates/route";
import { PATCH as patchBillingRate } from "@/app/api/admin/billing-rates/[key]/route";
import { PATCH as patchCompany } from "@/app/api/admin/companies/[id]/route";

describe("Billing configuration admin UI (rates + retainer)", () => {
  beforeAll(async () => {
    await seedIfEmpty(getDb());
  });

  it("lists the seeded billing rates", async () => {
    const response = await getBillingRates();
    const body = await response.json();
    expect(body.billingRates.length).toBeGreaterThan(0);
    expect(body.billingRates.find((r: { key: string }) => r.key === "po_standard")).toBeTruthy();
  });

  it("updates a billing rate's amount and bumps updatedAt", async () => {
    const before = await (await getBillingRates()).json();
    const original = before.billingRates.find((r: { key: string }) => r.key === "po_standard");

    const response = await patchBillingRate(
      jsonRequest("http://localhost/api/admin/billing-rates/po_standard", {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { amount: 12345 },
      }),
      { params: Promise.resolve({ key: "po_standard" }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.billingRate.amount).toBe(12345);
    expect(new Date(body.billingRate.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(original.updatedAt).getTime());

    // Restore, so other tests/files reading billing_rates keep seeing the seeded value.
    await patchBillingRate(
      jsonRequest("http://localhost/api/admin/billing-rates/po_standard", {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { amount: original.amount },
      }),
      { params: Promise.resolve({ key: "po_standard" }) }
    );
  });

  it("404s when updating an unknown rate key", async () => {
    const response = await patchBillingRate(
      jsonRequest("http://localhost/api/admin/billing-rates/nao_existe", {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { amount: 1 },
      }),
      { params: Promise.resolve({ key: "nao_existe" }) }
    );
    expect(response.status).toBe(404);
  });

  it("rejects a negative amount with 400", async () => {
    const response = await patchBillingRate(
      jsonRequest("http://localhost/api/admin/billing-rates/po_standard", {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { amount: -5 },
      }),
      { params: Promise.resolve({ key: "po_standard" }) }
    );
    expect(response.status).toBe(400);
  });

  it("updates a company's retainer and never leaks the SSO client secret", async () => {
    const db = getDb();
    const [company] = await db
      .insert(companies)
      .values({
        name: "Cliente Retainer",
        domain: uniqueDomain("retainer"),
        ssoClientSecret: "super-secret-value",
      })
      .returning();

    const response = await patchCompany(
      jsonRequest(`http://localhost/api/admin/companies/${company.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { retainerAmount: 250_000 },
      }),
      { params: Promise.resolve({ id: String(company.id) }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.company.retainerAmount).toBe(250_000);
    expect(body.company).not.toHaveProperty("ssoClientSecret");

    const [stored] = await db.select().from(companies).where(eq(companies.id, company.id));
    expect(stored.retainerAmount).toBe(250_000);
    expect(stored.ssoClientSecret).toBe("super-secret-value"); // untouched by this PATCH
  });

  it("404s when updating the retainer of an unknown company", async () => {
    const response = await patchCompany(
      jsonRequest("http://localhost/api/admin/companies/999999999", {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { retainerAmount: 1000 },
      }),
      { params: Promise.resolve({ id: "999999999" }) }
    );
    expect(response.status).toBe(404);
  });
});
