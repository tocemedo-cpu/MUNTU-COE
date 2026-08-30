import { describe, expect, it } from "vitest";
import { verifyCsrfToken } from "@/lib/csrf";

describe("verifyCsrfToken", () => {
  it("passes when the cookie and header match exactly", () => {
    expect(verifyCsrfToken("abc123", "abc123")).toBe(true);
  });

  it("fails when they differ", () => {
    expect(verifyCsrfToken("abc123", "different")).toBe(false);
  });

  it("fails when either side is missing", () => {
    expect(verifyCsrfToken(undefined, "abc123")).toBe(false);
    expect(verifyCsrfToken("abc123", null)).toBe(false);
    expect(verifyCsrfToken(null, null)).toBe(false);
  });

  it("fails on same-length values that differ only near the end (no early exit)", () => {
    expect(verifyCsrfToken("aaaaaaaaaa", "aaaaaaaaab")).toBe(false);
  });
});
