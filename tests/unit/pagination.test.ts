import { describe, expect, it } from "vitest";
import { parseLimit } from "@/lib/pagination";

describe("parseLimit", () => {
  it("defaults to 500 when no limit is given", () => {
    expect(parseLimit(new Request("http://localhost/api/requests"))).toBe(500);
  });

  it("honors a valid explicit limit", () => {
    expect(parseLimit(new Request("http://localhost/api/requests?limit=10"))).toBe(10);
  });

  it("caps an oversized limit at 2000", () => {
    expect(parseLimit(new Request("http://localhost/api/requests?limit=999999"))).toBe(2000);
  });

  it("falls back to the default for garbage input", () => {
    expect(parseLimit(new Request("http://localhost/api/requests?limit=abc"))).toBe(500);
    expect(parseLimit(new Request("http://localhost/api/requests?limit=-5"))).toBe(500);
    expect(parseLimit(new Request("http://localhost/api/requests?limit=0"))).toBe(500);
  });
});
