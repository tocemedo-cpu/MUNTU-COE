import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, suppliers, users } from "@/db/schema";
import { GET as listContracts, POST as createContract } from "@/app/api/contracts/route";
import { GET as getContract, PATCH as patchContract } from "@/app/api/contracts/[id]/route";

// contracts.created_by_user_id tem uma FK real para users.id — precisa de
// apontar para uma linha real (mesma razão de tests/integration/tenders.test.ts#makeBuyer).
async function makeBuyer(companyId: number) {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      name: `Comprador Contratos ${Date.now()}-${Math.random()}`,
      email: `contract-buyer-${Date.now()}-${Math.random()}@example.com`,
      role: "Administrador da empresa",
      initials: "CC",
      companyId,
      accessLevel: "company_admin",
    })
    .returning();
  return user;
}

async function makeCompany() {
  const db = getDb();
  const [company] = await db.insert(companies).values({ name: `Empresa Contrato ${Date.now()}`, domain: uniqueDomain("contract") }).returning();
  return company;
}

async function makeSupplier(name: string) {
  const db = getDb();
  const [supplier] = await db.insert(suppliers).values({ name, category: "Geral" }).returning();
  return supplier;
}

function dateOffset(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe("POST/GET /api/contracts", () => {
  it("registers a contract scoped to the company_admin's own company", async () => {
    const company = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const supplier = await makeSupplier(`Fornecedor Contrato ${Date.now()}`);

    const response = await createContract(
      jsonRequest("http://localhost/api/contracts", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Manutenção anual de válvulas",
          supplierId: supplier.id,
          value: 5_000_000,
          startDate: dateOffset(-1),
          endDate: dateOffset(365),
        },
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.contract.id).toMatch(/^CTR-2026-\d{4}$/);
    expect(body.contract.companyId).toBe(company.id);
    expect(body.contract.status).toBe("activo");
    expect(body.contract.supplier).toBe(supplier.name);
  });

  it("rejects an end date that is not after the start date", async () => {
    const company = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const supplier = await makeSupplier(`Fornecedor Datas ${Date.now()}`);

    const response = await createContract(
      jsonRequest("http://localhost/api/contracts", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: {
          title: "Contrato com datas invertidas",
          supplierId: supplier.id,
          value: 1000,
          startDate: dateOffset(30),
          endDate: dateOffset(1),
        },
      })
    );

    expect(response.status).toBe(400);
  });

  it("a supplier only sees its own contracts, a company_admin only its own company's", async () => {
    const company = await makeCompany();
    const otherCompany = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const otherBuyer = await makeBuyer(otherCompany.id);
    const supplier = await makeSupplier(`Fornecedor Âmbito ${Date.now()}`);
    const otherSupplier = await makeSupplier(`Outro Fornecedor ${Date.now()}`);

    await createContract(
      jsonRequest("http://localhost/api/contracts", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: { title: "Contrato A", supplierId: supplier.id, value: 1000, startDate: dateOffset(-1), endDate: dateOffset(90) },
      })
    );
    await createContract(
      jsonRequest("http://localhost/api/contracts", {
        method: "POST",
        session: { userId: otherBuyer.id, accessLevel: "company_admin", companyId: otherCompany.id },
        body: { title: "Contrato B", supplierId: otherSupplier.id, value: 2000, startDate: dateOffset(-1), endDate: dateOffset(90) },
      })
    );

    const companyResponse = await listContracts(
      jsonRequest("http://localhost/api/contracts", { method: "GET", session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id } })
    );
    const companyBody = await companyResponse.json();
    expect(companyBody.contracts).toHaveLength(1);
    expect(companyBody.contracts[0].title).toBe("Contrato A");

    const supplierResponse = await listContracts(
      jsonRequest("http://localhost/api/contracts", { method: "GET", session: { userId: 1, accessLevel: "supplier", supplierId: supplier.id } })
    );
    const supplierBody = await supplierResponse.json();
    expect(supplierBody.contracts).toHaveLength(1);
    expect(supplierBody.contracts[0].title).toBe("Contrato A");
  });
});

describe("GET/PATCH /api/contracts/:id", () => {
  it("blocks cross-company/cross-supplier access and terminates an active contract", async () => {
    const company = await makeCompany();
    const otherCompany = await makeCompany();
    const buyer = await makeBuyer(company.id);
    const otherBuyer = await makeBuyer(otherCompany.id);
    const supplier = await makeSupplier(`Fornecedor Terminação ${Date.now()}`);
    const outsiderSupplier = await makeSupplier(`Fornecedor Fora ${Date.now()}`);

    const createResponse = await createContract(
      jsonRequest("http://localhost/api/contracts", {
        method: "POST",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: { title: "Contrato a terminar", supplierId: supplier.id, value: 3000, startDate: dateOffset(-1), endDate: dateOffset(200) },
      })
    );
    const { contract } = await createResponse.json();

    const forbiddenGetCompany = await getContract(
      jsonRequest(`http://localhost/api/contracts/${contract.id}`, { method: "GET", session: { userId: otherBuyer.id, accessLevel: "company_admin", companyId: otherCompany.id } }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(forbiddenGetCompany.status).toBe(403);

    const forbiddenGetSupplier = await getContract(
      jsonRequest(`http://localhost/api/contracts/${contract.id}`, { method: "GET", session: { userId: 1, accessLevel: "supplier", supplierId: outsiderSupplier.id } }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(forbiddenGetSupplier.status).toBe(403);

    const terminated = await patchContract(
      jsonRequest(`http://localhost/api/contracts/${contract.id}`, {
        method: "PATCH",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: { action: "terminate" },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    const terminatedBody = await terminated.json();
    expect(terminatedBody.contract.status).toBe("terminado");

    const secondTermination = await patchContract(
      jsonRequest(`http://localhost/api/contracts/${contract.id}`, {
        method: "PATCH",
        session: { userId: buyer.id, accessLevel: "company_admin", companyId: company.id },
        body: { action: "terminate" },
      }),
      { params: Promise.resolve({ id: contract.id }) }
    );
    expect(secondTermination.status).toBe(400);
  });
});
