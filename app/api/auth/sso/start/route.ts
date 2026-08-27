import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { buildAuthorizationUrl, createPkcePair, discoverOidc, randomToken } from "@/lib/oidc";
import { signPayload } from "@/lib/session";

const SSO_STATE_COOKIE = "muntu_sso_state";

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  const domain = email?.split("@")[1];
  if (!domain) return redirectToLogin(request, "E-mail inválido para iniciar sessão SSO.");

  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.domain, domain));

  if (!company || company.authMethod !== "sso") {
    return redirectToLogin(request, "Esta empresa não tem SSO configurado.");
  }
  if (!company.ssoIssuerUrl || !company.ssoClientId || !company.ssoClientSecret) {
    return redirectToLogin(request, `${company.name} ainda não tem as credenciais de SSO configuradas.`);
  }

  try {
    const discovery = await discoverOidc(company.ssoIssuerUrl);
    const { verifier, challenge } = await createPkcePair();
    const state = randomToken(16);
    const nonce = randomToken(16);
    const redirectUri = new URL("/api/auth/sso/callback", request.url).toString();

    const authorizationUrl = buildAuthorizationUrl({
      authorizationEndpoint: discovery.authorization_endpoint,
      clientId: company.ssoClientId,
      redirectUri,
      state,
      nonce,
      codeChallenge: challenge,
    });

    const stateToken = await signPayload({ companyId: company.id, verifier, state, nonce, redirectUri }, 600);
    const store = await cookies();
    store.set(SSO_STATE_COOKIE, stateToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return Response.redirect(authorizationUrl, 302);
  } catch (error) {
    return redirectToLogin(request, error instanceof Error ? error.message : "Não foi possível iniciar o SSO.");
  }
}

function redirectToLogin(request: NextRequest, message: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("sso_error", message);
  return Response.redirect(url.toString(), 302);
}
