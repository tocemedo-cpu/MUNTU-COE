import { describe, expect, it } from "vitest";
import { checkSupplierRiskBlock } from "@/lib/risk-block";

describe("checkSupplierRiskBlock", () => {
  it("never blocks a supplier that isn't risk Alto, regardless of role", () => {
    expect(checkSupplierRiskBlock({ risk: "Baixo", accessLevel: "company_admin" })).toEqual({ blocked: false });
    expect(checkSupplierRiskBlock({ risk: "Médio", accessLevel: "system_admin" })).toEqual({ blocked: false });
  });

  it("blocks a company_admin outright for a risk Alto supplier, even with overrideRisk set", () => {
    const result = checkSupplierRiskBlock({ risk: "Alto", accessLevel: "company_admin", overrideRisk: true });
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.canOverride).toBe(false);
      expect(result.reason).toContain("só a equipa Muntu");
    }
  });

  it("blocks coe_manager for a risk Alto supplier unless overrideRisk is set", () => {
    const withoutOverride = checkSupplierRiskBlock({ risk: "Alto", accessLevel: "coe_manager" });
    expect(withoutOverride.blocked).toBe(true);
    if (withoutOverride.blocked) expect(withoutOverride.canOverride).toBe(true);

    const withOverride = checkSupplierRiskBlock({ risk: "Alto", accessLevel: "coe_manager", overrideRisk: true });
    expect(withOverride).toEqual({ blocked: false });
  });

  // system_admin perdeu aprovações excepcionais/overrides de risco no
  // redesenho de RBAC (ver README §Personas e permissões) — só
  // coe_manager consegue ultrapassar o bloqueio, mesmo com overrideRisk.
  it("blocks system_admin outright for a risk Alto supplier, even with overrideRisk set", () => {
    const result = checkSupplierRiskBlock({ risk: "Alto", accessLevel: "system_admin", overrideRisk: true });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.canOverride).toBe(false);
  });

  it("never blocks a supplier/analyst role — they never reach this decision point in practice, but the helper itself is role-agnostic beyond company_admin vs coe_manager", () => {
    const result = checkSupplierRiskBlock({ risk: "Alto", accessLevel: "analyst" });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.canOverride).toBe(false);
  });
});
