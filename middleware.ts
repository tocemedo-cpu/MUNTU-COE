import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

const PUBLIC_API_PATHS = new Set(["/api/auth/login", "/api/auth/logout"]);

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

  const headers = new Headers(request.headers);
  headers.set("x-muntu-user-id", String(session.userId));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
