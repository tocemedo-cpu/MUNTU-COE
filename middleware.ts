import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/company-lookup",
  "/api/auth/sso/start",
  "/api/auth/sso/callback",
]);

// Áreas de execução P2P fora do âmbito de um "requester" — só workflow
// próprio (pedidos) e a lista de fornecedores (necessária no formulário).
// company_admin, muntu_ops e supplier continuam sem esta restrição.
const REQUESTER_BLOCKED_PREFIXES = [
  "/api/dashboard",
  "/api/purchase-orders",
  "/api/receipts",
  "/api/invoices",
  "/api/exceptions",
  "/api/payments",
  "/api/documents",
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

  if (session.accessLevel === "requester" && REQUESTER_BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
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
