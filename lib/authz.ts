import type { AccessLevel } from "./session";

export type RequestSession = {
  userId: number;
  accessLevel: AccessLevel;
  companyId: number | null;
  supplierId: number | null;
};

/** Lê a sessão verificada que o middleware já injectou nos headers. */
export function getSession(request: Request): RequestSession {
  return {
    userId: Number(request.headers.get("x-muntu-user-id")),
    accessLevel: (request.headers.get("x-muntu-access-level") ?? "requester") as AccessLevel,
    companyId: request.headers.get("x-muntu-company-id") ? Number(request.headers.get("x-muntu-company-id")) : null,
    supplierId: request.headers.get("x-muntu-supplier-id") ? Number(request.headers.get("x-muntu-supplier-id")) : null,
  };
}

/** Como getSession, mas devolve null em vez de uma sessão falsa de
 * "requester" quando não há nenhum cookie válido — para rotas de acesso
 * misto (ex.: /api/applications), onde o middleware não força sessão e um
 * visitante sem conta é um caso legítimo, distinto de "sessão inválida". */
export function getOptionalSession(request: Request): RequestSession | null {
  const userIdHeader = request.headers.get("x-muntu-user-id");
  if (!userIdHeader) return null;
  const userId = Number(userIdHeader);
  if (!Number.isFinite(userId)) return null;
  return getSession(request);
}

/** Devolve uma Response 403 se o nível de acesso não estiver na lista permitida, senão null. */
export function forbidUnless(request: Request, allowed: AccessLevel[]): Response | null {
  const { accessLevel } = getSession(request);
  if (!allowed.includes(accessLevel)) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }
  return null;
}
