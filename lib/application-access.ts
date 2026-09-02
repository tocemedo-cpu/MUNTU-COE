import { verifyPayload } from "./session";

// Governance/homologação — fora do system_admin desde o redesenho de
// RBAC (ver README §Personas e permissões); supplier_governance entra
// para poder controlar candidaturas de fornecedor especificamente (ver
// homologateApplicationRoles em .../homologate/route.ts para a restrição
// mais fina por `kind`).
export const APPLICATION_REVIEW_ROLES = ["coe_manager", "supplier_governance"];
export const APPLICATION_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias — tempo de vida de uma candidatura em avaliação

export type ApplicationTokenPayload = { applicationId: string; purpose: "application_access"; exp: number };

/** Verifica que um token de acesso a candidatura é válido e pertence
 * mesmo a esta candidatura — é assim que um candidato sem conta consulta o
 * estado e anexa documentos (ver app/api/applications/[id]). */
export async function verifyApplicationAccessToken(token: string | null, applicationId: string): Promise<boolean> {
  if (!token) return false;
  const payload = await verifyPayload<ApplicationTokenPayload>(token);
  return Boolean(payload && payload.purpose === "application_access" && payload.applicationId === applicationId);
}
