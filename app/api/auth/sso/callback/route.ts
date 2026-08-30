import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDb } from "@/db";
import { companies, users } from "@/db/schema";
import { CSRF_COOKIE_NAME, generateCsrfToken } from "@/lib/csrf";
import { discoverOidc, exchangeCodeForTokens } from "@/lib/oidc";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  verifyPayload,
  type AccessLevel,
} from "@/lib/session";

const SSO_STATE_COOKIE = "muntu_sso_state";

type SsoState = {
  companyId: number;
  verifier: string;
  state: string;
  nonce: string;
  redirectUri: string;
  exp: number;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const store = await cookies();
  const stateCookie = store.get(SSO_STATE_COOKIE)?.value;
  store.delete(SSO_STATE_COOKIE);

  const state = await verifyPayload<SsoState>(stateCookie);

  if (!code || !returnedState || !state || state.state !== returnedState) {
    return redirectToLogin(request, "Pedido de SSO inválido ou expirado. Tente novamente.");
  }

  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, state.companyId));
  if (!company || !company.ssoIssuerUrl || !company.ssoClientId || !company.ssoClientSecret) {
    return redirectToLogin(request, "Configuração de SSO da empresa em falta.");
  }

  try {
    const discovery = await discoverOidc(company.ssoIssuerUrl);
    const tokens = await exchangeCodeForTokens({
      tokenEndpoint: discovery.token_endpoint,
      clientId: company.ssoClientId,
      clientSecret: company.ssoClientSecret,
      code,
      redirectUri: state.redirectUri,
      codeVerifier: state.verifier,
    });

    const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    const { payload: idToken } = await jwtVerify(tokens.id_token, jwks, {
      issuer: discovery.issuer,
      audience: company.ssoClientId,
    });

    if (idToken.nonce !== state.nonce) {
      throw new Error("Nonce do ID token não corresponde — possível repetição de pedido.");
    }

    const email = String(idToken.email ?? "").toLowerCase();
    if (!email) throw new Error("O fornecedor de identidade não devolveu um e-mail.");

    let [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      const name = String(idToken.name ?? email.split("@")[0]);
      const initials =
        name
          .split(" ")
          .map((part) => part[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase() || "US";
      [user] = await db
        .insert(users)
        .values({
          name,
          email,
          password: null,
          role: "Requisitante",
          initials,
          companyId: company.id,
          accessLevel: "requester",
          ssoSubject: String(idToken.sub),
        })
        .returning();
    } else if (!user.ssoSubject) {
      [user] = await db
        .update(users)
        .set({ ssoSubject: String(idToken.sub) })
        .where(eq(users.id, user.id))
        .returning();
    }

    const token = await createSessionToken({
      userId: user.id,
      accessLevel: user.accessLevel as AccessLevel,
      companyId: user.companyId,
      supplierId: user.supplierId,
    });
    store.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    // Legível por JS de propósito (sem httpOnly) — ver lib/csrf.ts.
    store.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });

    const url = new URL("/", request.url);
    url.hash = "portal";
    return Response.redirect(url.toString(), 302);
  } catch (error) {
    return redirectToLogin(request, error instanceof Error ? error.message : "Falha na autenticação SSO.");
  }
}

function redirectToLogin(request: NextRequest, message: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("sso_error", message);
  return Response.redirect(url.toString(), 302);
}
