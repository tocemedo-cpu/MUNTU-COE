import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, jsonRequest } from "./helpers";
import { suppliers } from "@/db/schema";
import { PATCH as patchSupplier } from "@/app/api/suppliers/[id]/route";

describe("PATCH /api/suppliers/:id — conta bancária (ISO 20022)", () => {
  it("an internal role sets IBAN/BIC", async () => {
    const db = getDb();
    const [supplier] = await db.insert(suppliers).values({ name: `Fornecedor Banco ${Date.now()}`, category: "Geral" }).returning();

    const response = await patchSupplier(
      jsonRequest(`http://localhost/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "coe_manager" },
        body: { iban: "AO06004000000198765432101", bic: "BFAAAOLU" },
      }),
      { params: Promise.resolve({ id: String(supplier.id) }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.supplier.iban).toBe("AO06004000000198765432101");
    expect(body.supplier.bic).toBe("BFAAAOLU");
  });

  it("supplier_governance also sets IBAN/BIC (vendor governance, alongside coe_manager)", async () => {
    const db = getDb();
    const [supplier] = await db.insert(suppliers).values({ name: `Fornecedor Governance ${Date.now()}`, category: "Geral" }).returning();

    const response = await patchSupplier(
      jsonRequest(`http://localhost/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "supplier_governance" },
        body: { iban: "AO06004000000198765432101", bic: "BFAAAOLU" },
      }),
      { params: Promise.resolve({ id: String(supplier.id) }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.supplier.iban).toBe("AO06004000000198765432101");
  });

  it("a supplier cannot set its own IBAN/BIC through the self-service schema", async () => {
    const db = getDb();
    const [supplier] = await db.insert(suppliers).values({ name: `Fornecedor Próprio ${Date.now()}`, category: "Geral" }).returning();

    const response = await patchSupplier(
      jsonRequest(`http://localhost/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "supplier", supplierId: supplier.id },
        body: { iban: "AO06004000000198765432101", bic: "BFAAAOLU" },
      }),
      { params: Promise.resolve({ id: String(supplier.id) }) }
    );

    // supplierSelfUpdateSchema não conhece iban/bic — passam despercebidos
    // (schema.strip() por omissão do zod) e o corpo fica vazio, por isso
    // a rota recusa com "Nada para actualizar" em vez de gravar algo.
    expect(response.status).toBe(400);
    const [stored] = await db.select().from(suppliers).where(eq(suppliers.id, supplier.id));
    expect(stored.iban).toBeNull();
    expect(stored.bic).toBeNull();
  });
});
