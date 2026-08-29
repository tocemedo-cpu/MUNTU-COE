import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { seedIfEmpty } from "@/db/seed-data";
import { companies, users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { generateJti, signPayload } from "@/lib/session";
import { POST as requestReset } from "@/app/api/auth/password-reset/request/route";
import { POST as confirmReset } from "@/app/api/auth/password-reset/confirm/route";
import { POST as login } from "@/app/api/auth/login/route";

describe("Password reset flow", () => {
  beforeAll(async () => {
    await seedIfEmpty(getDb());
  });

  it("always responds 200 {ok:true} for /request, whether or not the account exists (no user enumeration)", async () => {
    const existing = await requestReset(jsonRequest("http://localhost/api/auth/password-reset/request", { method: "POST", body: { email: "ana.manuel@operadora.ao" } }));
    expect(existing.status).toBe(200);
    expect(await existing.json()).toEqual({ ok: true });

    const missing = await requestReset(jsonRequest("http://localhost/api/auth/password-reset/request", { method: "POST", body: { email: "ninguem-aqui@operadora.ao" } }));
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ ok: true });
  });

  it("responds the same 200 for an SSO-only account (no local password) without crashing", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Cliente SSO", domain: uniqueDomain("sso-reset") }).returning();
    await db.insert(users).values({
      name: "Utilizador SSO",
      email: `sso-user-${company.id}@example.com`,
      password: null,
      role: "Requisitante",
      initials: "US",
      companyId: company.id,
      accessLevel: "requester",
      ssoSubject: "sub-123",
    });

    const response = await requestReset(
      jsonRequest("http://localhost/api/auth/password-reset/request", { method: "POST", body: { email: `sso-user-${company.id}@example.com` } })
    );
    expect(response.status).toBe(200);
  });

  it("lets a user set a new password with a valid token, and the new password actually works for login", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Cliente Reset", domain: uniqueDomain("reset-flow") }).returning();
    const email = `reset-flow-${company.id}@example.com`;
    await db.insert(users).values({
      name: "Utilizador Reset",
      email,
      password: await hashPassword("SenhaAntiga123!"),
      role: "Requisitante",
      initials: "UR",
      companyId: company.id,
      accessLevel: "requester",
    });

    const token = await signPayload({ userId: (await db.select().from(users).where(eq(users.email, email)))[0].id, purpose: "password_reset" }, 1800);

    const confirmResponse = await confirmReset(
      jsonRequest("http://localhost/api/auth/password-reset/confirm", { method: "POST", body: { token, password: "SenhaNovaForte456!" } })
    );
    expect(confirmResponse.status).toBe(200);

    const loginWithNew = await login(new Request("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: "SenhaNovaForte456!" }) }));
    expect(loginWithNew.status).toBe(200);

    const loginWithOld = await login(new Request("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: "SenhaAntiga123!" }) }));
    expect(loginWithOld.status).toBe(401);
  });

  it("a token with a jti is single-use: a second confirm with the same token is rejected", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Cliente Single Use", domain: uniqueDomain("single-use") }).returning();
    const email = `single-use-${company.id}@example.com`;
    await db.insert(users).values({
      name: "Utilizador Single Use",
      email,
      password: await hashPassword("SenhaAntiga123!"),
      role: "Requisitante",
      initials: "SU",
      companyId: company.id,
      accessLevel: "requester",
    });
    const userId = (await db.select().from(users).where(eq(users.email, email)))[0].id;
    const token = await signPayload({ userId, purpose: "password_reset", jti: generateJti() }, 1800);

    const first = await confirmReset(
      jsonRequest("http://localhost/api/auth/password-reset/confirm", { method: "POST", body: { token, password: "PrimeiraSenha123!" } })
    );
    expect(first.status).toBe(200);

    const second = await confirmReset(
      jsonRequest("http://localhost/api/auth/password-reset/confirm", { method: "POST", body: { token, password: "SegundaSenha456!" } })
    );
    expect(second.status).toBe(400);

    // A primeira password definida continua válida — o replay não a substituiu.
    const loginWithFirst = await login(new Request("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: "PrimeiraSenha123!" }) }));
    expect(loginWithFirst.status).toBe(200);
  });

  it("a legacy token without a jti stays reusable within its window (backwards compatible)", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Cliente Legacy", domain: uniqueDomain("legacy-reset") }).returning();
    const email = `legacy-reset-${company.id}@example.com`;
    await db.insert(users).values({
      name: "Utilizador Legacy",
      email,
      password: await hashPassword("SenhaAntiga123!"),
      role: "Requisitante",
      initials: "UL",
      companyId: company.id,
      accessLevel: "requester",
    });
    const userId = (await db.select().from(users).where(eq(users.email, email)))[0].id;
    const legacyToken = await signPayload({ userId, purpose: "password_reset" }, 1800); // sem jti, propositadamente

    const first = await confirmReset(
      jsonRequest("http://localhost/api/auth/password-reset/confirm", { method: "POST", body: { token: legacyToken, password: "PrimeiraSenha123!" } })
    );
    expect(first.status).toBe(200);

    const second = await confirmReset(
      jsonRequest("http://localhost/api/auth/password-reset/confirm", { method: "POST", body: { token: legacyToken, password: "SegundaSenha456!" } })
    );
    expect(second.status).toBe(200);
  });

  it("rejects an expired token", async () => {
    const token = await signPayload({ userId: 1, purpose: "password_reset" }, -10);
    const response = await confirmReset(jsonRequest("http://localhost/api/auth/password-reset/confirm", { method: "POST", body: { token, password: "QualquerSenha123!" } }));
    expect(response.status).toBe(400);
  });

  it("rejects a token that isn't purpose-tagged as password_reset (e.g. a normal session token)", async () => {
    const sessionLikeToken = await signPayload({ userId: 1, accessLevel: "requester" }, 1800);
    const response = await confirmReset(
      jsonRequest("http://localhost/api/auth/password-reset/confirm", { method: "POST", body: { token: sessionLikeToken, password: "QualquerSenha123!" } })
    );
    expect(response.status).toBe(400);
  });

  it("rejects a well-formed token for a user that no longer exists", async () => {
    const token = await signPayload({ userId: 999999999, purpose: "password_reset" }, 1800);
    const response = await confirmReset(jsonRequest("http://localhost/api/auth/password-reset/confirm", { method: "POST", body: { token, password: "QualquerSenha123!" } }));
    expect(response.status).toBe(400);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const token = await signPayload({ userId: 1, purpose: "password_reset" }, 1800);
    const response = await confirmReset(jsonRequest("http://localhost/api/auth/password-reset/confirm", { method: "POST", body: { token, password: "short" } }));
    expect(response.status).toBe(400);
  });
});
