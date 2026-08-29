import { describe, expect, it } from "vitest";
import {
  bucketRequestsByMonth,
  computeAvgCycleDays,
  computeRequestSlaDueAt,
  computeSlaOnTimePct,
  isRequestSlaBreached,
} from "@/lib/requests-sla";

describe("computeRequestSlaDueAt", () => {
  const from = new Date("2026-08-28T10:00:00Z");

  it("gives Alta a 4h window", () => {
    expect(computeRequestSlaDueAt("Alta", from).toISOString()).toBe("2026-08-28T14:00:00.000Z");
  });

  it("gives Média an 8h window", () => {
    expect(computeRequestSlaDueAt("Média", from).toISOString()).toBe("2026-08-28T18:00:00.000Z");
  });

  it("gives Normal (and any unknown priority) a 16h window", () => {
    expect(computeRequestSlaDueAt("Normal", from).toISOString()).toBe("2026-08-29T02:00:00.000Z");
    expect(computeRequestSlaDueAt("qualquer-coisa", from).toISOString()).toBe("2026-08-29T02:00:00.000Z");
  });
});

describe("isRequestSlaBreached", () => {
  const due = new Date("2026-08-28T14:00:00Z");

  it("is not breached when decided before the due date", () => {
    expect(isRequestSlaBreached(due, new Date("2026-08-28T13:00:00Z"))).toBe(false);
  });

  it("is breached when decided after the due date", () => {
    expect(isRequestSlaBreached(due, new Date("2026-08-28T15:00:00Z"))).toBe(true);
  });

  it("for a pending request, is breached only once 'now' passes the due date", () => {
    expect(isRequestSlaBreached(due, null, new Date("2026-08-28T13:59:00Z"))).toBe(false);
    expect(isRequestSlaBreached(due, null, new Date("2026-08-28T14:01:00Z"))).toBe(true);
  });
});

describe("computeSlaOnTimePct", () => {
  it("is 0 for an empty list", () => {
    expect(computeSlaOnTimePct([])).toBe(0);
  });

  it("rounds the percentage of non-breached items", () => {
    const now = new Date("2026-08-28T20:00:00Z");
    const items = [
      { createdAt: "2026-08-28T08:00:00Z", slaDueAt: "2026-08-28T12:00:00Z", decidedAt: "2026-08-28T11:00:00Z" }, // on time
      { createdAt: "2026-08-28T08:00:00Z", slaDueAt: "2026-08-28T12:00:00Z", decidedAt: "2026-08-28T13:00:00Z" }, // breached
      { createdAt: "2026-08-28T08:00:00Z", slaDueAt: "2026-08-29T12:00:00Z", decidedAt: null }, // pending, not yet due
    ];
    expect(computeSlaOnTimePct(items, now)).toBe(67);
  });
});

describe("computeAvgCycleDays", () => {
  it("is 0 when nothing has been decided yet", () => {
    expect(computeAvgCycleDays([{ createdAt: "2026-08-28T08:00:00Z", slaDueAt: "2026-08-28T12:00:00Z", decidedAt: null }])).toBe(0);
  });

  it("averages only decided items, ignoring pending ones", () => {
    const items = [
      { createdAt: "2026-08-20T00:00:00Z", slaDueAt: "2026-08-20T08:00:00Z", decidedAt: "2026-08-21T00:00:00Z" }, // 1 day
      { createdAt: "2026-08-20T00:00:00Z", slaDueAt: "2026-08-20T08:00:00Z", decidedAt: "2026-08-23T00:00:00Z" }, // 3 days
      { createdAt: "2026-08-20T00:00:00Z", slaDueAt: "2026-08-20T08:00:00Z", decidedAt: null }, // ignored
    ];
    expect(computeAvgCycleDays(items)).toBe(2);
  });
});

describe("bucketRequestsByMonth", () => {
  it("returns one bucket per month, oldest first, with real counts and 0 for empty months", () => {
    const now = new Date("2026-08-15T12:00:00Z");
    const items = [
      { createdAt: "2026-08-01T00:00:00Z", slaDueAt: "2026-08-01T08:00:00Z", decidedAt: "2026-08-01T04:00:00Z" },
      { createdAt: "2026-08-10T00:00:00Z", slaDueAt: "2026-08-10T08:00:00Z", decidedAt: null },
      { createdAt: "2026-06-05T00:00:00Z", slaDueAt: "2026-06-05T08:00:00Z", decidedAt: "2026-06-06T00:00:00Z" },
    ];
    const buckets = bucketRequestsByMonth(items, 3, now);
    expect(buckets.map((b) => b.count)).toEqual([1, 0, 2]);
    expect(buckets[2].label.toLowerCase()).toContain("ago");
    expect(buckets[0].label.toLowerCase()).toContain("jun");
  });

  it("defaults to 6 months and never fabricates a count for a month with no data", () => {
    const buckets = bucketRequestsByMonth([], 6, new Date("2026-08-29T00:00:00Z"));
    expect(buckets).toHaveLength(6);
    expect(buckets.every((b) => b.count === 0 && b.slaPct === 0)).toBe(true);
  });
});
