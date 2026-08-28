import { describe, expect, it } from "vitest";
import { createSessionToken, signPayload, verifyPayload, verifySessionToken } from "@/lib/session";

describe("session tokens", () => {
  it("round-trips a session payload signed with createSessionToken", async () => {
    const token = await createSessionToken({ userId: 7, accessLevel: "company_admin", companyId: 3, supplierId: null });
    const payload = await verifySessionToken(token);
    expect(payload).toMatchObject({ userId: 7, accessLevel: "company_admin", companyId: 3, supplierId: null });
  });

  it("rejects a missing or malformed token", async () => {
    await expect(verifySessionToken(undefined)).resolves.toBeNull();
    await expect(verifySessionToken("not-a-real-token")).resolves.toBeNull();
  });

  it("rejects a token whose signature was tampered with", async () => {
    const token = await createSessionToken({ userId: 7, accessLevel: "requester", companyId: 3, supplierId: null });
    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${signature.slice(0, -1)}${signature.at(-1) === "a" ? "b" : "a"}`;
    await expect(verifySessionToken(tampered)).resolves.toBeNull();
  });

  it("rejects a token whose payload was tampered with (privilege escalation attempt)", async () => {
    const token = await createSessionToken({ userId: 7, accessLevel: "requester", companyId: 3, supplierId: null });
    const [, signature] = token.split(".");
    const escalated = await signPayload({ userId: 7, accessLevel: "requester" }, 60);
    // Swapping in a validly-signed-but-different payload's signature must not verify against
    // an attacker-edited payload segment.
    const [escalatedPayload] = escalated.split(".");
    await expect(verifySessionToken(`${escalatedPayload}.${signature}`)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await signPayload({ userId: 1 }, -10);
    await expect(verifyPayload(expired)).resolves.toBeNull();
  });

  it("accepts a token that has not expired yet", async () => {
    const fresh = await signPayload({ userId: 1 }, 60);
    await expect(verifyPayload(fresh)).resolves.toMatchObject({ userId: 1 });
  });
});
