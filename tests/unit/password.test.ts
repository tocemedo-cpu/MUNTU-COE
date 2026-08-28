import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("lib/password", () => {
  it("hashes a password so it no longer matches the plaintext", async () => {
    const hash = await hashPassword("Muntu2026!");
    expect(hash).not.toBe("Muntu2026!");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it("verifies the correct password against its hash", async () => {
    const hash = await hashPassword("Muntu2026!");
    await expect(verifyPassword("Muntu2026!", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Muntu2026!");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("salts each hash differently, even for the same password", async () => {
    const [a, b] = await Promise.all([hashPassword("Muntu2026!"), hashPassword("Muntu2026!")]);
    expect(a).not.toBe(b);
  });
});
