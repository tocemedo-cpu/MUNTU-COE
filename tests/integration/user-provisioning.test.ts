import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, suppliers, users } from "@/db/schema";
import { GET as listAdminUsers, POST as createAdminUser } from "@/app/api/admin/users/route";
import { GET as listCompanyUsers, POST as inviteCompanyUser } from "@/app/api/company/users/route";

async function makeCompany(label: string) {
  const db = getDb();
  const [company] = await db.insert(companies).values({ name: `Empresa ${label}`, domain: uniqueDomain(`user-prov-${label}`) }).returning();
  return company;
}

function uniqueEmail(label: string) {
  return `${label}-${Date.now()}-${Math.random()}@example.com`;
}

describe("POST /api/admin/users", () => {
  it("creates a company_admin/requester with a real companyId, without a password", async () => {
    const company = await makeCompany("admin-create");
    const email = uniqueEmail("new-requester");

    const response = await createAdminUser(
      jsonRequest("http://localhost/api/admin/users", {
        method: "POST",
        body: { name: "Novo Requisitante", email, accessLevel: "requester", companyId: company.id },
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.user.email).toBe(email);
    expect(body.user).not.toHaveProperty("password");
    expect(body.user.role).toBe("Requisitante");

    const db = getDb();
    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row.password).toBeNull();
    expect(row.companyId).toBe(company.id);
  });

  it("creates a supplier user with a real supplierId", async () => {
    const db = getDb();
    const [supplier] = await db.insert(suppliers).values({ name: `Fornecedor Prov ${Date.now()}`, category: "Logística" }).returning();
    const email = uniqueEmail("new-supplier-user");

    const response = await createAdminUser(
      jsonRequest("http://localhost/api/admin/users", {
        method: "POST",
        body: { name: "Novo Fornecedor", email, accessLevel: "supplier", supplierId: supplier.id },
      })
    );
    expect(response.status).toBe(201);
    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row.supplierId).toBe(supplier.id);
    expect(row.role).toBe("Fornecedor");
  });

  it("creates a coe_manager/system_admin without needing companyId or supplierId", async () => {
    const response = await createAdminUser(
      jsonRequest("http://localhost/api/admin/users", {
        method: "POST",
        body: { name: "Nova Gestora COE", email: uniqueEmail("new-coe-manager"), accessLevel: "coe_manager" },
      })
    );
    expect(response.status).toBe(201);
  });

  it("400s when a company_admin/requester payload has no companyId, or a supplier payload has no supplierId", async () => {
    const missingCompany = await createAdminUser(
      jsonRequest("http://localhost/api/admin/users", { method: "POST", body: { name: "X", email: uniqueEmail("no-company"), accessLevel: "requester" } })
    );
    expect(missingCompany.status).toBe(400);

    const missingSupplier = await createAdminUser(
      jsonRequest("http://localhost/api/admin/users", { method: "POST", body: { name: "X", email: uniqueEmail("no-supplier"), accessLevel: "supplier" } })
    );
    expect(missingSupplier.status).toBe(400);
  });

  it("400s when companyId/supplierId don't reference a real row", async () => {
    const response = await createAdminUser(
      jsonRequest("http://localhost/api/admin/users", {
        method: "POST",
        body: { name: "X", email: uniqueEmail("bad-company-id"), accessLevel: "requester", companyId: 999_999_999 },
      })
    );
    expect(response.status).toBe(400);
  });

  it("409s when the e-mail already belongs to another user", async () => {
    const company = await makeCompany("admin-clash");
    const email = uniqueEmail("clash");
    await createAdminUser(
      jsonRequest("http://localhost/api/admin/users", { method: "POST", body: { name: "Primeiro", email, accessLevel: "requester", companyId: company.id } })
    );
    const again = await createAdminUser(
      jsonRequest("http://localhost/api/admin/users", { method: "POST", body: { name: "Segundo", email, accessLevel: "requester", companyId: company.id } })
    );
    expect(again.status).toBe(409);
  });

  it("GET keeps listing every user (unchanged behaviour)", async () => {
    const response = await listAdminUsers();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.users)).toBe(true);
  });
});

describe("GET/POST /api/company/users (scoped team invites)", () => {
  it("only lists users from the caller's own company, never another one", async () => {
    const companyA = await makeCompany("team-scope-a");
    const companyB = await makeCompany("team-scope-b");
    const db = getDb();
    await db.insert(users).values({ name: "Alguém da A", email: uniqueEmail("company-a"), role: "Requisitante", initials: "AA", companyId: companyA.id, accessLevel: "requester" });
    await db.insert(users).values({ name: "Alguém da B", email: uniqueEmail("company-b"), role: "Requisitante", initials: "AB", companyId: companyB.id, accessLevel: "requester" });

    const response = await listCompanyUsers(
      jsonRequest("http://localhost/api/company/users", { method: "GET", session: { userId: 1, accessLevel: "company_admin", companyId: companyA.id } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.users.every((u: { name: string }) => u.name !== "Alguém da B")).toBe(true);
  });

  it("invites a colleague into the caller's own company, defaulting to requester", async () => {
    const company = await makeCompany("team-invite");
    const email = uniqueEmail("colleague");

    const response = await inviteCompanyUser(
      jsonRequest("http://localhost/api/company/users", {
        method: "POST",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
        body: { name: "Colega Novo", email },
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.user.accessLevel).toBe("requester");

    const db = getDb();
    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row.companyId).toBe(company.id);
    expect(row.password).toBeNull();
  });

  it("400s when the company_admin session has no companyId", async () => {
    const response = await inviteCompanyUser(
      jsonRequest("http://localhost/api/company/users", {
        method: "POST",
        session: { userId: 1, accessLevel: "company_admin", companyId: null },
        body: { name: "X", email: uniqueEmail("no-company-session") },
      })
    );
    expect(response.status).toBe(400);
  });

  it("409s on a duplicate e-mail, and rejects an accessLevel outside requester/company_admin", async () => {
    const company = await makeCompany("team-invite-clash");
    const email = uniqueEmail("team-clash");
    await inviteCompanyUser(
      jsonRequest("http://localhost/api/company/users", { method: "POST", session: { userId: 1, accessLevel: "company_admin", companyId: company.id }, body: { name: "X", email } })
    );
    const again = await inviteCompanyUser(
      jsonRequest("http://localhost/api/company/users", { method: "POST", session: { userId: 1, accessLevel: "company_admin", companyId: company.id }, body: { name: "Y", email } })
    );
    expect(again.status).toBe(409);

    const badLevel = await inviteCompanyUser(
      jsonRequest("http://localhost/api/company/users", {
        method: "POST",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
        body: { name: "Z", email: uniqueEmail("bad-level"), accessLevel: "supplier" },
      })
    );
    expect(badLevel.status).toBe(400);
  });
});
