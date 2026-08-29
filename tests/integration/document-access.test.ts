import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, exceptions, invoices, receipts, requests, suppliers, users } from "@/db/schema";
import { canAccessDocumentEntity } from "@/lib/document-access";
import { GET as getDocuments, POST as postDocument } from "@/app/api/documents/route";

async function makeTwoCompanies(label: string) {
  const db = getDb();
  const [companyA] = await db.insert(companies).values({ name: `Empresa A ${label}`, domain: uniqueDomain(`doc-access-a-${label}`) }).returning();
  const [companyB] = await db.insert(companies).values({ name: `Empresa B ${label}`, domain: uniqueDomain(`doc-access-b-${label}`) }).returning();
  return { companyA, companyB };
}

async function makeUser(label: string, companyId: number | null) {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ name: `Utilizador ${label}`, email: `doc-access-${label}-${Date.now()}-${Math.random()}@example.com`, role: "Requisitante", initials: "UT", companyId, accessLevel: "requester" })
    .returning();
  return user;
}

describe("canAccessDocumentEntity", () => {
  it("requester only accesses their own request", async () => {
    const db = getDb();
    const { companyA } = await makeTwoCompanies("req1");
    const owner = await makeUser("owner-req1", companyA.id);
    const stranger = await makeUser("stranger-req1", companyA.id);
    const [req] = await db
      .insert(requests)
      .values({
        id: `REQ-DOCACC-${companyA.id}`,
        subject: "x",
        tower: "Requisition-to-PO",
        value: 0,
        status: "Validação",
        priority: "Normal",
        owner: "x",
        ownerUserId: owner.id,
        companyId: companyA.id,
        sla: "16 horas",
        stage: 1,
        submitted: "agora",
        supplier: "x",
        costCenter: "x",
      })
      .returning();

    expect(await canAccessDocumentEntity(db, { userId: owner.id, accessLevel: "requester", companyId: null, supplierId: null }, "request", req.id)).toBe(true);
    expect(await canAccessDocumentEntity(db, { userId: stranger.id, accessLevel: "requester", companyId: null, supplierId: null }, "request", req.id)).toBe(false);
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "company_admin", companyId: companyA.id, supplierId: null }, "request", req.id)).toBe(true);
    const { companyB } = await makeTwoCompanies("req2");
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "company_admin", companyId: companyB.id, supplierId: null }, "request", req.id)).toBe(false);
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "coe_manager", companyId: null, supplierId: null }, "request", req.id)).toBe(true);
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "system_admin", companyId: null, supplierId: null }, "request", req.id)).toBe(true);
  });

  it("returns false for a request id that does not exist", async () => {
    const db = getDb();
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "system_admin", companyId: null, supplierId: null }, "request", "REQ-DOES-NOT-EXIST")).toBe(true); // system_admin always true regardless
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "company_admin", companyId: 1, supplierId: null }, "request", "REQ-DOES-NOT-EXIST")).toBe(false);
  });

  it("supplier only accesses their own supplier entity; company_admin/analyst can access any", async () => {
    const db = getDb();
    const [supplierA] = await db.insert(suppliers).values({ name: `Fornecedor A ${Date.now()}`, category: "x" }).returning();
    const [supplierB] = await db.insert(suppliers).values({ name: `Fornecedor B ${Date.now()}`, category: "x" }).returning();

    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "supplier", companyId: null, supplierId: supplierA.id }, "supplier", String(supplierA.id))).toBe(true);
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "supplier", companyId: null, supplierId: supplierA.id }, "supplier", String(supplierB.id))).toBe(false);
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "company_admin", companyId: 1, supplierId: null }, "supplier", String(supplierA.id))).toBe(true);
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "analyst", companyId: null, supplierId: null }, "supplier", String(supplierA.id))).toBe(true);
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "requester", companyId: null, supplierId: null }, "supplier", String(supplierA.id))).toBe(false);
  });

  it("invoice/receipt/exception scope by companyId (company_admin) and supplierId (supplier)", async () => {
    const db = getDb();
    const { companyA, companyB } = await makeTwoCompanies("ire");
    const [supplierA] = await db.insert(suppliers).values({ name: `Fornecedor IRE ${Date.now()}`, category: "x" }).returning();

    const [invoice] = await db
      .insert(invoices)
      .values({ id: `FT-DOCACC-${companyA.id}`, supplier: supplierA.name, po: "PO-x", value: 1, match: "3-way match", status: "Validada", due: "hoje", companyId: companyA.id, supplierId: supplierA.id })
      .returning();
    const [receipt] = await db
      .insert(receipts)
      .values({ po: "PO-x", description: "x", supplier: supplierA.name, value: 1, companyId: companyA.id, supplierId: supplierA.id })
      .returning();
    const [exception] = await db
      .insert(exceptions)
      .values({ id: `EXC-DOCACC-${companyA.id}`, title: "x", ref: "x", owner: "x", impact: "x", companyId: companyA.id })
      .returning();

    for (const [entityType, entityId] of [
      ["invoice", invoice.id],
      ["receipt", String(receipt.id)],
      ["exception", exception.id],
    ] as const) {
      expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "company_admin", companyId: companyA.id, supplierId: null }, entityType, entityId)).toBe(true);
      expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "company_admin", companyId: companyB.id, supplierId: null }, entityType, entityId)).toBe(false);
      expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "analyst", companyId: null, supplierId: null }, entityType, entityId)).toBe(true);
    }
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "supplier", companyId: null, supplierId: supplierA.id }, "invoice", invoice.id)).toBe(true);
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "supplier", companyId: null, supplierId: 999999 }, "invoice", invoice.id)).toBe(false);
    // exception has no supplierId column at all — a supplier session never gets access
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "supplier", companyId: null, supplierId: supplierA.id }, "exception", exception.id)).toBe(false);
  });

  it("rejects an unknown entity type", async () => {
    const db = getDb();
    expect(await canAccessDocumentEntity(db, { userId: 1, accessLevel: "system_admin", companyId: null, supplierId: null }, "not-a-real-type", "1")).toBe(false);
  });
});

describe("GET/POST /api/documents with entityType/entityId (end-to-end)", () => {
  it("a requester can upload and read back a document attached to their own request, but not to someone else's", async () => {
    const db = getDb();
    const { companyA } = await makeTwoCompanies("e2e-req");
    const owner = await makeUser("owner-e2e-req", companyA.id);
    const stranger = await makeUser("stranger-e2e-req", companyA.id);
    const [req] = await db
      .insert(requests)
      .values({
        id: `REQ-DOCE2E-${companyA.id}`,
        subject: "x",
        tower: "Requisition-to-PO",
        value: 0,
        status: "Validação",
        priority: "Normal",
        owner: "x",
        ownerUserId: owner.id,
        companyId: companyA.id,
        sla: "16 horas",
        stage: 1,
        submitted: "agora",
        supplier: "x",
        costCenter: "x",
      })
      .returning();

    const form = new FormData();
    form.append("file", new File(["conteudo real"], "evidencia.txt", { type: "text/plain" }));
    form.append("entityType", "request");
    form.append("entityId", req.id);
    const uploadHeaders = { "x-muntu-user-id": String(owner.id), "x-muntu-access-level": "requester", "x-muntu-company-id": "", "x-muntu-supplier-id": "" };
    const uploadResponse = await postDocument(new Request("http://localhost/api/documents", { method: "POST", headers: uploadHeaders, body: form }));
    expect(uploadResponse.status).toBe(201);

    const listResponse = await getDocuments(
      jsonRequest(`http://localhost/api/documents?entityType=request&entityId=${req.id}`, { method: "GET", session: { userId: owner.id, accessLevel: "requester" } })
    );
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.documents.some((d: { name: string }) => d.name === "evidencia.txt")).toBe(true);

    const strangerResponse = await getDocuments(
      jsonRequest(`http://localhost/api/documents?entityType=request&entityId=${req.id}`, { method: "GET", session: { userId: stranger.id, accessLevel: "requester" } })
    );
    expect(strangerResponse.status).toBe(403);
  });

  it("400s for an unknown entityType on both GET and POST", async () => {
    const getResponse = await getDocuments(
      jsonRequest("http://localhost/api/documents?entityType=not-real&entityId=1", { method: "GET", session: { userId: 1, accessLevel: "system_admin" } })
    );
    expect(getResponse.status).toBe(400);

    const form = new FormData();
    form.append("file", new File(["x"], "x.txt"));
    form.append("entityType", "not-real");
    form.append("entityId", "1");
    const postResponse = await postDocument(
      new Request("http://localhost/api/documents", {
        method: "POST",
        headers: { "x-muntu-user-id": "1", "x-muntu-access-level": "system_admin", "x-muntu-company-id": "", "x-muntu-supplier-id": "" },
        body: form,
      })
    );
    expect(postResponse.status).toBe(400);
  });
});
