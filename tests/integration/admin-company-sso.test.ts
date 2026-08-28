import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies } from "@/db/schema";
import { GET as getCompanies } from "@/app/api/admin/companies/route";
import { PATCH as patchCompany } from "@/app/api/admin/companies/[id]/route";

describe("Company SSO admin UI", () => {
  it("GET never returns the SSO client secret, but flags whether one is set", async () => {
    const db = getDb();
    const [company] = await db
      .insert(companies)
      .values({ name: "Cliente SSO GET", domain: uniqueDomain("sso-get"), ssoClientSecret: "shh-its-a-secret" })
      .returning();

    const response = await getCompanies();
    const body = await response.json();
    const row = body.companies.find((c: { id: number }) => c.id === company.id);
    expect(row).not.toHaveProperty("ssoClientSecret");
    expect(row.hasSsoClientSecret).toBe(true);
  });

  it("sets authMethod, issuer URL, client ID and secret in one PATCH", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Cliente SSO Set", domain: uniqueDomain("sso-set") }).returning();

    const response = await patchCompany(
      jsonRequest(`http://localhost/api/admin/companies/${company.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: {
          authMethod: "sso",
          ssoIssuerUrl: "https://login.microsoftonline.com/tenant-id/v2.0",
          ssoClientId: "client-abc",
          ssoClientSecret: "top-secret-value",
        },
      }),
      { params: Promise.resolve({ id: String(company.id) }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.company.authMethod).toBe("sso");
    expect(body.company.ssoIssuerUrl).toBe("https://login.microsoftonline.com/tenant-id/v2.0");
    expect(body.company.ssoClientId).toBe("client-abc");
    expect(body.company.hasSsoClientSecret).toBe(true);
    expect(body.company).not.toHaveProperty("ssoClientSecret");

    const [stored] = await db.select().from(companies).where(eq(companies.id, company.id));
    expect(stored.ssoClientSecret).toBe("top-secret-value");
  });

  it("leaves the existing secret untouched when ssoClientSecret is omitted from the PATCH", async () => {
    const db = getDb();
    const [company] = await db
      .insert(companies)
      .values({ name: "Cliente SSO Keep", domain: uniqueDomain("sso-keep"), ssoClientSecret: "original-secret" })
      .returning();

    const response = await patchCompany(
      jsonRequest(`http://localhost/api/admin/companies/${company.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { ssoIssuerUrl: "https://updated-issuer.example.com" },
      }),
      { params: Promise.resolve({ id: String(company.id) }) }
    );
    expect(response.status).toBe(200);

    const [stored] = await db.select().from(companies).where(eq(companies.id, company.id));
    expect(stored.ssoClientSecret).toBe("original-secret");
    expect(stored.ssoIssuerUrl).toBe("https://updated-issuer.example.com");
  });

  it("clears the issuer URL/client ID when an empty string is sent, but never the secret", async () => {
    const db = getDb();
    const [company] = await db
      .insert(companies)
      .values({ name: "Cliente SSO Clear", domain: uniqueDomain("sso-clear"), ssoIssuerUrl: "https://old.example.com", ssoClientId: "old-id" })
      .returning();

    const response = await patchCompany(
      jsonRequest(`http://localhost/api/admin/companies/${company.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { ssoIssuerUrl: "", ssoClientId: "" },
      }),
      { params: Promise.resolve({ id: String(company.id) }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.company.ssoIssuerUrl).toBeNull();
    expect(body.company.ssoClientId).toBeNull();
  });

  it("404s for an unknown company id", async () => {
    const response = await patchCompany(
      jsonRequest("http://localhost/api/admin/companies/999999999", {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { authMethod: "sso" },
      }),
      { params: Promise.resolve({ id: "999999999" }) }
    );
    expect(response.status).toBe(404);
  });

  it("400s when the PATCH body has nothing to update", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Cliente Vazio", domain: uniqueDomain("sso-empty") }).returning();

    const response = await patchCompany(
      jsonRequest(`http://localhost/api/admin/companies/${company.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: {},
      }),
      { params: Promise.resolve({ id: String(company.id) }) }
    );
    expect(response.status).toBe(400);
  });
});
