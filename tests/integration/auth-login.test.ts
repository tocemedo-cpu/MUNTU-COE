import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "./helpers";
import { seedIfEmpty } from "@/db/seed-data";
import { verifySessionToken } from "@/lib/session";
import { POST as login } from "@/app/api/auth/login/route";

describe("POST /api/auth/login", () => {
  beforeAll(async () => {
    await seedIfEmpty(getDb());
  });

  it("logs in with the seeded demo requester and sets a valid session cookie", async () => {
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "ana.manuel@operadora.ao", password: "Muntu2026!" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.email).toBe("ana.manuel@operadora.ao");
    expect(body.user).not.toHaveProperty("password");

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toMatch(/^muntu_session=/);
    expect(setCookie).toMatch(/HttpOnly/);

    const token = setCookie!.split(";")[0].split("=")[1];
    const session = await verifySessionToken(token);
    expect(session).toMatchObject({ accessLevel: "requester" });
  });

  it("rejects a wrong password without leaking whether the account exists", async () => {
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "ana.manuel@operadora.ao", password: "wrong-password" }),
      })
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an email that has no account with the same 401 (no user enumeration)", async () => {
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "ninguem@operadora.ao", password: "Muntu2026!" }),
      })
    );
    expect(response.status).toBe(401);
  });

  it("rejects a malformed payload with 400 before touching the database", async () => {
    const response = await login(
      new Request("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify({ email: "not-an-email" }) })
    );
    expect(response.status).toBe(400);
  });
});
