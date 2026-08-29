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
  "/api/admin/sla-alerts/run",
  "/api/admin/payment-release/run",
  // Estatísticas agregadas e não sensíveis para o site público e o login,
  // mostradas antes de haver sessão nenhuma — ver app/api/public-stats.
  "/api/public-stats",
]);

// Prefixos de acesso misto: quem ainda não tem conta nenhuma (candidato a
// empresa/fornecedor) precisa de conseguir submeter e consultar a sua
// própria candidatura por um token dedicado, sem sessão — mas a mesma
// família de rotas também serve a Muntu (coe_manager/system_admin) para
// avaliar/homologar candidaturas, e essas chamadas continuam a precisar da
// sessão real. Por isso não entra em PUBLIC_API_PATHS (que ignora sessão
// por completo) nem em ROUTE_ACCESS (que exige sessão válida): aqui só se
// verifica o cookie SE ele existir, preenchendo os headers x-muntu-* nesse
// caso, e nunca se devolve 401 por falta de sessão — cada rota decide, com
// getOptionalSession (lib/authz.ts), se está a servir um candidato (sem
// sessão, com token) ou a Muntu (com sessão).
const OPTIONAL_AUTH_PREFIXES = ["/api/applications"];

function isOptionalAuthPath(pathname: string): boolean {
  return OPTIONAL_AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

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
  // Sourcing (tenders/RFQ) — supplier entra para poder propor às suas
  // próprias oportunidades; o âmbito por convite/empresa é feito no
  // handler (nunca a lista completa de tenders de outra empresa/fornecedor).
  { prefix: "/api/tenders", allow: ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"] },
  { prefix: "/api/contracts", allow: ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"] },
  { prefix: "/api/catalog", allow: ["requester", "company_admin", "analyst", "coe_manager", "system_admin", "supplier"] },
  // Equipa da própria empresa (convidar/listar colegas) — só o
  // Administrador da empresa, nunca outro nível. O âmbito por empresa em
  // si (nunca ver/convidar para outra empresa) é feito no handler a
  // partir de session.companyId, não aqui.
  { prefix: "/api/company", allow: ["company_admin"] },
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
    if (isOptionalAuthPath(pathname)) return NextResponse.next();
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
