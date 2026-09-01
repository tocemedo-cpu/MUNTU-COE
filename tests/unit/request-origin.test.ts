import { describe, expect, it } from "vitest";
import { publicOrigin } from "@/lib/request-origin";

describe("publicOrigin", () => {
  it("falls back to request.url origin when there is no forwarding proxy (local dev)", () => {
    expect(publicOrigin(new Request("http://localhost:3000/api/auth/password-reset/request"))).toBe("http://localhost:3000");
  });

  it("trusts x-forwarded-host/x-forwarded-proto behind a reverse proxy (Render)", () => {
    const request = new Request("http://localhost:10000/api/auth/password-reset/request", {
      headers: { "x-forwarded-host": "muntu-coe-portal.onrender.com", "x-forwarded-proto": "https" },
    });
    expect(publicOrigin(request)).toBe("https://muntu-coe-portal.onrender.com");
  });

  it("defaults to https when x-forwarded-host is set without x-forwarded-proto", () => {
    const request = new Request("http://localhost:10000/api/auth/password-reset/request", {
      headers: { "x-forwarded-host": "muntu-coe-portal.onrender.com" },
    });
    expect(publicOrigin(request)).toBe("https://muntu-coe-portal.onrender.com");
  });

  it("uses only the first value of a comma-separated x-forwarded-proto", () => {
    const request = new Request("http://localhost:10000/api/auth/password-reset/request", {
      headers: { "x-forwarded-host": "muntu-coe-portal.onrender.com", "x-forwarded-proto": "https,http" },
    });
    expect(publicOrigin(request)).toBe("https://muntu-coe-portal.onrender.com");
  });
});
