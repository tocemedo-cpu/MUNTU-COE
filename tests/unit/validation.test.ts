import { describe, expect, it } from "vitest";
import {
  clientInvoiceGenerateSchema,
  loginSchema,
  parseJsonBody,
  requestActionSchema,
  supplierSelfUpdateSchema,
  userAccessUpdateSchema,
} from "@/lib/validation";

describe("loginSchema", () => {
  it("accepts a well-formed email/password pair", () => {
    expect(loginSchema.safeParse({ email: "ana.manuel@operadora.ao", password: "Muntu2026!" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "Muntu2026!" }).success).toBe(false);
  });

  it("rejects a missing password", () => {
    expect(loginSchema.safeParse({ email: "ana.manuel@operadora.ao", password: "" }).success).toBe(false);
  });
});

describe("requestActionSchema", () => {
  it("only accepts approve/reject", () => {
    expect(requestActionSchema.safeParse({ action: "approve" }).success).toBe(true);
    expect(requestActionSchema.safeParse({ action: "reject" }).success).toBe(true);
    expect(requestActionSchema.safeParse({ action: "delete" }).success).toBe(false);
  });
});

describe("supplierSelfUpdateSchema", () => {
  it("does not allow a supplier to self-declare passport/risk/status", () => {
    const parsed = supplierSelfUpdateSchema.safeParse({ category: "MRO", local: "80%", passport: 100, risk: "Baixo" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Fields outside the schema are stripped by zod's default object parsing, not rejected —
      // asserting they never survive into parsed.data is what actually protects the route.
      expect(parsed.data).not.toHaveProperty("passport");
      expect(parsed.data).not.toHaveProperty("risk");
    }
  });
});

describe("userAccessUpdateSchema", () => {
  it("rejects an unknown access level", () => {
    expect(userAccessUpdateSchema.safeParse({ accessLevel: "super_admin" }).success).toBe(false);
  });

  it("accepts a known access level with nullable company/supplier ids", () => {
    const parsed = userAccessUpdateSchema.safeParse({ accessLevel: "supplier", companyId: null, supplierId: 4 });
    expect(parsed.success).toBe(true);
  });
});

describe("clientInvoiceGenerateSchema", () => {
  it("defaults scope to 'total' when omitted", () => {
    const parsed = clientInvoiceGenerateSchema.safeParse({ companyId: 1, periodStart: "2026-08-01", periodEnd: "2026-08-31" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.scope).toBe("total");
  });

  it("rejects a non-positive companyId", () => {
    const parsed = clientInvoiceGenerateSchema.safeParse({ companyId: 0, periodStart: "2026-08-01", periodEnd: "2026-08-31" });
    expect(parsed.success).toBe(false);
  });
});

describe("parseJsonBody", () => {
  it("returns a 400 Response with the first validation message on bad input", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email", password: "" }),
    });
    const result = await parseJsonBody(request, loginSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(typeof body.error).toBe("string");
    }
  });

  it("returns the parsed data on valid input", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ana.manuel@operadora.ao", password: "Muntu2026!" }),
    });
    const result = await parseJsonBody(request, loginSchema);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("ana.manuel@operadora.ao");
  });

  it("returns a 400 (not a crash) on malformed JSON", async () => {
    const request = new Request("http://localhost/api/auth/login", { method: "POST", body: "{not json" });
    const result = await parseJsonBody(request, loginSchema);
    expect(result.success).toBe(false);
  });
});
