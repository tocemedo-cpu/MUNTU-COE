import type { AccessLevel } from "./session";

export type RequestSession = {
  userId: number;
  accessLevel: AccessLevel;
  companyId: number | null;
};

/** Lê a sessão verificada que o middleware já injectou nos headers. */
export function getSession(request: Request): RequestSession {
  return {
    userId: Number(request.headers.get("x-muntu-user-id")),
    accessLevel: (request.headers.get("x-muntu-access-level") ?? "requester") as AccessLevel,
    companyId: request.headers.get("x-muntu-company-id") ? Number(request.headers.get("x-muntu-company-id")) : null,
  };
}

/** Devolve uma Response 403 se o nível de acesso não estiver na lista permitida, senão null. */
export function forbidUnless(request: Request, allowed: AccessLevel[]): Response | null {
  const { accessLevel } = getSession(request);
  if (!allowed.includes(accessLevel)) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }
  return null;
}
