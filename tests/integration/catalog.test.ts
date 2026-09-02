import { describe, expect, it } from "vitest";
import { getDb, jsonRequest } from "./helpers";
import { suppliers, users } from "@/db/schema";
import { GET as listCatalog, POST as createCatalogItem } from "@/app/api/catalog/route";
import { PATCH as patchCatalogItem } from "@/app/api/catalog/[id]/route";

async function makeSupplier(name: string) {
  const db = getDb();
  const [supplier] = await db.insert(suppliers).values({ name, category: "Geral" }).returning();
  return supplier;
}

// catalog_items.created_by_user_id tem uma FK real para users.id — mesma
// razão de tests/integration/tenders.test.ts#makeBuyer.
async function makeCurator(accessLevel: "analyst" | "coe_manager") {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      name: `Curador ${Date.now()}-${Math.random()}`,
      email: `curator-${Date.now()}-${Math.random()}@example.com`,
      role: "Curador de catálogo",
      initials: "CU",
      accessLevel,
    })
    .returning();
  return user;
}

describe("POST/GET /api/catalog", () => {
  it("curators (analyst/coe_manager) can add a catalog item", async () => {
    const supplier = await makeSupplier(`Fornecedor Catálogo ${Date.now()}`);
    const curator = await makeCurator("analyst");

    const response = await createCatalogItem(
      jsonRequest("http://localhost/api/catalog", {
        method: "POST",
        session: { userId: curator.id, accessLevel: "analyst" },
        body: { name: "Capacete de segurança", category: "EPI", supplierId: supplier.id, unitPrice: 12_000, unit: "un" },
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.item.id).toMatch(/^CAT-2026-\d{4}$/);
    expect(body.item.supplier).toBe(supplier.name);
    expect(body.item.active).toBe(true);
  });

  it("refuses a company_admin trying to add a catalog item — only the Muntu team curates prices", async () => {
    const supplier = await makeSupplier(`Fornecedor Recusa ${Date.now()}`);

    const response = await createCatalogItem(
      jsonRequest("http://localhost/api/catalog", {
        method: "POST",
        session: { userId: 1, accessLevel: "company_admin", companyId: 1 },
        body: { name: "Item não autorizado", supplierId: supplier.id, unitPrice: 1000 },
      })
    );

    expect(response.status).toBe(403);
  });

  it("a requester browsing the catalog only ever sees active items, never inactive ones", async () => {
    const supplier = await makeSupplier(`Fornecedor Filtro ${Date.now()}`);
    const curator = await makeCurator("coe_manager");
    const created = await createCatalogItem(
      jsonRequest("http://localhost/api/catalog", {
        method: "POST",
        session: { userId: curator.id, accessLevel: "coe_manager" },
        body: { name: "Item a desactivar", supplierId: supplier.id, unitPrice: 5000 },
      })
    );
    const { item } = await created.json();

    await patchCatalogItem(
      jsonRequest(`http://localhost/api/catalog/${item.id}`, {
        method: "PATCH",
        session: { userId: curator.id, accessLevel: "coe_manager" },
        body: { active: false },
      }),
      { params: Promise.resolve({ id: item.id }) }
    );

    const requesterView = await listCatalog(
      jsonRequest("http://localhost/api/catalog", { method: "GET", session: { userId: 1, accessLevel: "requester" } })
    );
    const requesterBody = await requesterView.json();
    expect(requesterBody.items.some((row: { id: string }) => row.id === item.id)).toBe(false);

    const curatorView = await listCatalog(
      jsonRequest("http://localhost/api/catalog", { method: "GET", session: { userId: curator.id, accessLevel: "coe_manager" } })
    );
    const curatorBody = await curatorView.json();
    expect(curatorBody.items.some((row: { id: string }) => row.id === item.id)).toBe(true);
  });

  it("a supplier only ever sees its own catalog items, including inactive ones", async () => {
    const supplierA = await makeSupplier(`Fornecedor A Catálogo ${Date.now()}`);
    const supplierB = await makeSupplier(`Fornecedor B Catálogo ${Date.now()}`);
    const curator = await makeCurator("coe_manager");
    await createCatalogItem(
      jsonRequest("http://localhost/api/catalog", {
        method: "POST",
        session: { userId: curator.id, accessLevel: "coe_manager" },
        body: { name: "Item do fornecedor A", supplierId: supplierA.id, unitPrice: 100 },
      })
    );
    await createCatalogItem(
      jsonRequest("http://localhost/api/catalog", {
        method: "POST",
        session: { userId: curator.id, accessLevel: "coe_manager" },
        body: { name: "Item do fornecedor B", supplierId: supplierB.id, unitPrice: 200 },
      })
    );

    const response = await listCatalog(
      jsonRequest("http://localhost/api/catalog", { method: "GET", session: { userId: 1, accessLevel: "supplier", supplierId: supplierA.id } })
    );
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe("Item do fornecedor A");
  });
});

describe("PATCH /api/catalog/:id", () => {
  it("updates price/description fields for a curator, 404s for an unknown item", async () => {
    const supplier = await makeSupplier(`Fornecedor Update ${Date.now()}`);
    const curator = await makeCurator("coe_manager");
    const created = await createCatalogItem(
      jsonRequest("http://localhost/api/catalog", {
        method: "POST",
        session: { userId: curator.id, accessLevel: "coe_manager" },
        body: { name: "Item a actualizar", supplierId: supplier.id, unitPrice: 1000 },
      })
    );
    const { item } = await created.json();

    const updated = await patchCatalogItem(
      jsonRequest(`http://localhost/api/catalog/${item.id}`, {
        method: "PATCH",
        session: { userId: curator.id, accessLevel: "coe_manager" },
        body: { unitPrice: 1500 },
      }),
      { params: Promise.resolve({ id: item.id }) }
    );
    const updatedBody = await updated.json();
    expect(updatedBody.item.unitPrice).toBe(1500);

    const notFound = await patchCatalogItem(
      jsonRequest("http://localhost/api/catalog/CAT-2026-9999", {
        method: "PATCH",
        session: { userId: curator.id, accessLevel: "coe_manager" },
        body: { unitPrice: 1 },
      }),
      { params: Promise.resolve({ id: "CAT-2026-9999" }) }
    );
    expect(notFound.status).toBe(404);
  });
});
