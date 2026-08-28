import { beforeAll, describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, exceptions, paymentBatches, receipts } from "@/db/schema";
import { GET as getReceipts } from "@/app/api/receipts/route";
import { PATCH as patchReceipt } from "@/app/api/receipts/[id]/route";
import { GET as getExceptions } from "@/app/api/exceptions/route";
import { PATCH as patchException } from "@/app/api/exceptions/[id]/route";
import { GET as getPayments } from "@/app/api/payments/route";
import { PATCH as patchPayment } from "@/app/api/payments/[id]/route";

type Fixture = Awaited<ReturnType<typeof setUpTwoCompanies>>;

async function setUpTwoCompanies() {
  const db = getDb();
  const [companyA] = await db.insert(companies).values({ name: "Empresa A", domain: uniqueDomain("scope-a") }).returning();
  const [companyB] = await db.insert(companies).values({ name: "Empresa B", domain: uniqueDomain("scope-b") }).returning();

  const [receiptA] = await db
    .insert(receipts)
    .values({ po: "PO-A", description: "Recepção A", supplier: "Fornecedor A", value: 1, progress: 50, companyId: companyA.id })
    .returning();
  const [receiptB] = await db
    .insert(receipts)
    .values({ po: "PO-B", description: "Recepção B", supplier: "Fornecedor B", value: 1, progress: 50, companyId: companyB.id })
    .returning();

  const [exceptionA] = await db
    .insert(exceptions)
    .values({ id: `EXC-TEST-A-${companyA.id}`, title: "Excepção A", ref: "ref-a", owner: "x", age: "1h", impact: "0", companyId: companyA.id })
    .returning();
  const [exceptionB] = await db
    .insert(exceptions)
    .values({ id: `EXC-TEST-B-${companyB.id}`, title: "Excepção B", ref: "ref-b", owner: "x", age: "1h", impact: "0", companyId: companyB.id })
    .returning();

  const [paymentA] = await db
    .insert(paymentBatches)
    .values({ id: `PAY-TEST-A-${companyA.id}`, date: "hoje", count: 1, value: 1, companyId: companyA.id })
    .returning();
  const [paymentB] = await db
    .insert(paymentBatches)
    .values({ id: `PAY-TEST-B-${companyB.id}`, date: "hoje", count: 1, value: 1, companyId: companyB.id })
    .returning();

  return { companyA, companyB, receiptA, receiptB, exceptionA, exceptionB, paymentA, paymentB };
}

describe("Company scoping for receipts/exceptions/payments", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await setUpTwoCompanies();
  });

  it("company_admin only sees their own company's receipts", async () => {
    const response = await getReceipts(
      jsonRequest("http://localhost/api/receipts", {
        method: "GET",
        session: { userId: 1, accessLevel: "company_admin", companyId: fixture.companyA.id },
      })
    );
    const body = await response.json();
    const ids = body.receipts.map((r: { id: number }) => r.id);
    expect(ids).toContain(fixture.receiptA.id);
    expect(ids).not.toContain(fixture.receiptB.id);
  });

  it("company_admin only sees their own company's exceptions", async () => {
    const response = await getExceptions(
      jsonRequest("http://localhost/api/exceptions", {
        method: "GET",
        session: { userId: 1, accessLevel: "company_admin", companyId: fixture.companyA.id },
      })
    );
    const body = await response.json();
    const ids = body.exceptions.map((e: { id: string }) => e.id);
    expect(ids).toContain(fixture.exceptionA.id);
    expect(ids).not.toContain(fixture.exceptionB.id);
  });

  it("company_admin only sees their own company's payment batches", async () => {
    const response = await getPayments(
      jsonRequest("http://localhost/api/payments", {
        method: "GET",
        session: { userId: 1, accessLevel: "company_admin", companyId: fixture.companyA.id },
      })
    );
    const body = await response.json();
    const ids = body.paymentBatches.map((p: { id: string }) => p.id);
    expect(ids).toContain(fixture.paymentA.id);
    expect(ids).not.toContain(fixture.paymentB.id);
  });

  it("a non-scoped role (system_admin) still sees every company's data", async () => {
    const response = await getReceipts(
      jsonRequest("http://localhost/api/receipts", { method: "GET", session: { userId: 1, accessLevel: "system_admin" } })
    );
    const body = await response.json();
    const ids = body.receipts.map((r: { id: number }) => r.id);
    expect(ids).toContain(fixture.receiptA.id);
    expect(ids).toContain(fixture.receiptB.id);
  });

  it("company_admin cannot confirm a receipt belonging to another company (403)", async () => {
    const response = await patchReceipt(
      jsonRequest(`http://localhost/api/receipts/${fixture.receiptB.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "company_admin", companyId: fixture.companyA.id },
        body: { action: "confirm" },
      }),
      { params: Promise.resolve({ id: String(fixture.receiptB.id) }) }
    );
    expect(response.status).toBe(403);
  });

  it("company_admin cannot resolve an exception belonging to another company (403)", async () => {
    const response = await patchException(
      jsonRequest(`http://localhost/api/exceptions/${fixture.exceptionB.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "company_admin", companyId: fixture.companyA.id },
        body: { action: "resolve" },
      }),
      { params: Promise.resolve({ id: fixture.exceptionB.id }) }
    );
    expect(response.status).toBe(403);
  });

  it("company_admin cannot release a payment batch belonging to another company (403)", async () => {
    const response = await patchPayment(
      jsonRequest(`http://localhost/api/payments/${fixture.paymentB.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "company_admin", companyId: fixture.companyA.id },
        body: { action: "release" },
      }),
      { params: Promise.resolve({ id: fixture.paymentB.id }) }
    );
    expect(response.status).toBe(403);
  });

  it("company_admin CAN confirm/resolve/release their own company's records", async () => {
    const receiptResponse = await patchReceipt(
      jsonRequest(`http://localhost/api/receipts/${fixture.receiptA.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "company_admin", companyId: fixture.companyA.id },
        body: { action: "confirm" },
      }),
      { params: Promise.resolve({ id: String(fixture.receiptA.id) }) }
    );
    expect(receiptResponse.status).toBe(200);
  });
});
