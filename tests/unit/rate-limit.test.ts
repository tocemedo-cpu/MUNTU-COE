import { describe, expect, it } from "vitest";
import { isRateLimited } from "@/lib/rate-limit";

describe("isRateLimited", () => {
  it("allows up to the limit, then blocks the next call in the same window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(isRateLimited(key, 3, 60_000)).toBe(false);
    expect(isRateLimited(key, 3, 60_000)).toBe(true);
  });

  it("keeps different keys independent", () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    expect(isRateLimited(keyA, 1, 60_000)).toBe(false);
    expect(isRateLimited(keyA, 1, 60_000)).toBe(true);
    expect(isRateLimited(keyB, 1, 60_000)).toBe(false);
  });

  it("lets a call through again once the window has passed", async () => {
    const key = `test-window-${Math.random()}`;
    expect(isRateLimited(key, 1, 20)).toBe(false);
    expect(isRateLimited(key, 1, 20)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(isRateLimited(key, 1, 20)).toBe(false);
  });
});
