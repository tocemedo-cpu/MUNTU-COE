import { describe, expect, it } from "vitest";
import { computeSlaDueAt, isSlaBreached } from "@/lib/support";

describe("computeSlaDueAt", () => {
  const from = new Date("2026-08-28T10:00:00Z");

  it("gives urgente a 4h window", () => {
    expect(computeSlaDueAt("urgente", from).toISOString()).toBe("2026-08-28T14:00:00.000Z");
  });

  it("gives alta a 24h window", () => {
    expect(computeSlaDueAt("alta", from).toISOString()).toBe("2026-08-29T10:00:00.000Z");
  });

  it("gives normal a 72h window", () => {
    expect(computeSlaDueAt("normal", from).toISOString()).toBe("2026-08-31T10:00:00.000Z");
  });

  it("gives baixa the longest window (120h)", () => {
    expect(computeSlaDueAt("baixa", from).toISOString()).toBe("2026-09-02T10:00:00.000Z");
  });
});

describe("isSlaBreached", () => {
  const now = new Date("2026-08-28T12:00:00Z");
  const past = new Date("2026-08-28T10:00:00Z");
  const future = new Date("2026-08-28T14:00:00Z");

  it("is breached when the due date is in the past and the ticket is still open", () => {
    expect(isSlaBreached(past, "aberto", now)).toBe(true);
    expect(isSlaBreached(past, "em_curso", now)).toBe(true);
  });

  it("is not breached when the due date is still in the future", () => {
    expect(isSlaBreached(future, "aberto", now)).toBe(false);
  });

  it("is never breached once the ticket is resolved or closed, even past due", () => {
    expect(isSlaBreached(past, "resolvido", now)).toBe(false);
    expect(isSlaBreached(past, "fechado", now)).toBe(false);
  });

  it("accepts an ISO string just as well as a Date", () => {
    expect(isSlaBreached(past.toISOString(), "aberto", now)).toBe(true);
  });
});
