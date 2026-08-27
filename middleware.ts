import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken, type AccessLevel } from "@/lib/session";

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/company-lookup",
  "/api/auth/sso/start",
  "/api/auth/sso/callback",
]);

// Bloqueio grosso por prefixo de rota — cobre o essencial da autorização
// por persona. As rotas com âmbito por linha (ex.: /api/requests, que
// filtra por dono/empresa) fazem verificação adicional no próprio handler
// via lib/authz.ts. Um prefixo sem entrada aqui fica aberto a qualquer
// sessão válida (comportamento pré-existente para suppliers, POs, etc.).
const ROUTE_ACCESS: { prefix: string; allow: AccessLevel[] }[] = [
  { prefix: "/api/admin", allow: ["system_admin"] },
  { prefix: "/api/dashboard", allow: ["company_admin", "coe_manager", "system_admin"] },
  { prefix: "/api/purchase-orders", allow: ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"] },
  { prefix: "/api/receipts", allow: ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"] },
  { prefix: "/api/invoices", allow: ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"] },
  { prefix: "/api/exceptions", allow: ["company_admin", "analyst", "coe_manager", "system_admin"] },
  { prefix: "/api/payments", allow: ["company_admin", "analyst", "coe_manager", "system_admin"] },
  { prefix: "/api/documents", allow: ["company_admin", "analyst", "coe_manager", "system_admin"] },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/") || PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    return NextResponse.json({ error: "Sessão inválida ou expirada. Inicie sessão novamente." }, { status: 401 });
  }

  const rule = ROUTE_ACCESS.find((r) => pathname.startsWith(r.prefix));
  if (rule && !rule.allow.includes(session.accessLevel)) {
    return NextResponse.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const headers = new Headers(request.headers);
  headers.set("x-muntu-user-id", String(session.userId));
  headers.set("x-muntu-access-level", session.accessLevel);
  headers.set("x-muntu-company-id", session.companyId != null ? String(session.companyId) : "");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
