import { describe, expect, it } from "vitest";
import { GET as getHealth } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("reports ok when the database is reachable", async () => {
    const response = await getHealth();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok", db: "up" });
  });
});
