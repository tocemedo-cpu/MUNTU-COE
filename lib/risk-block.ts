import type { AccessLevel } from "./session";

export type RiskBlockResult = { blocked: false } | { blocked: true; reason: string; canOverride: boolean };

// Um fornecedor de risco "Alto" bloqueia por omissão a geração de uma PO
// (aprovação de pedido ou adjudicação de tender) — só coe_manager
// consegue confirmar overrideRisk para avançar mesmo assim (aprovações
// excepcionais/overrides de risco alto são governance de negócio,
// explicitamente fora do system_admin desde o redesenho de RBAC — ver
// README §Personas e permissões); company_admin/analyst nunca podem,
// mesma regra de quem edita suppliers.risk em primeiro lugar (a Muntu
// avalia risco, não a empresa cliente nem o próprio fornecedor).
export function checkSupplierRiskBlock(params: { risk: string; accessLevel: AccessLevel; overrideRisk?: boolean }): RiskBlockResult {
  if (params.risk !== "Alto") return { blocked: false };
  const canOverride = params.accessLevel === "coe_manager";
  if (canOverride && params.overrideRisk) return { blocked: false };
  return {
    blocked: true,
    canOverride,
    reason: canOverride
      ? "Fornecedor de risco alto — confirme o override para avançar mesmo assim."
      : "Fornecedor de risco alto — só a equipa Muntu pode aprovar mesmo assim.",
  };
}
