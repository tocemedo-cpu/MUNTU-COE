import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken, type AccessLevel } from "@/lib/session";

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/company-lookup",
  "/api/auth/sso/start",
  "/api/auth/sso/callback",
  // Recuperação de acesso: por definição, quem chama ainda não tem sessão.
  "/api/auth/password-reset/request",
  "/api/auth/password-reset/confirm",
  // Autenticada por CRON_SECRET (header x-cron-secret), não por sessão —
  // é chamada por um agendador externo, não por um utilizador logado.
  "/api/admin/billing/generate-monthly",
  // Estatísticas agregadas e não sensíveis para o site público e o login,
  // mostradas antes de haver sessão nenhuma — ver app/api/public-stats.
  "/api/public-stats",
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
  // /api/documents não tem entrada aqui de propósito: um requisitante ou
  // fornecedor precisa de conseguir aceder aos documentos ligados à sua
  // própria entidade (o seu pedido, o seu fornecedor). A autorização real
  // é por linha — feita no próprio handler via
  // lib/document-access.ts#canAccessDocumentEntity — não por nível de
  // acesso sozinho.
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
  headers.set("x-muntu-supplier-id", session.supplierId != null ? String(session.supplierId) : "");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
