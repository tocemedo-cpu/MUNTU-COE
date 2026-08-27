import { toBase64Url } from "./session";

/**
 * Cliente OIDC genérico (authorization code + PKCE) para o SSO por empresa.
 * Funciona com qualquer fornecedor compatível com OpenID Connect Discovery
 * (Microsoft Entra ID, Google Workspace, Okta, ...). Cada empresa configura
 * o seu próprio `sso_issuer_url` / `sso_client_id` / `sso_client_secret` na
 * tabela `companies` — sem essas credenciais reais, o fluxo não completa
 * (o passo de troca do código por tokens falha contra um emissor genérico).
 */

export function randomToken(byteLength = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)).buffer);
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: toBase64Url(digest) };
}

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

const discoveryCache = new Map<string, OidcDiscovery>();

export async function discoverOidc(issuerUrl: string): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuerUrl);
  if (cached) return cached;

  const wellKnownUrl = new URL("/.well-known/openid-configuration", issuerUrl).toString();
  const response = await fetch(wellKnownUrl);
  if (!response.ok) {
    throw new Error(`Não foi possível obter a configuração OIDC de ${issuerUrl} (HTTP ${response.status}).`);
  }
  const discovery = (await response.json()) as OidcDiscovery;
  discoveryCache.set(issuerUrl, discovery);
  return discovery;
}

export function buildAuthorizationUrl(params: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCodeForTokens(params: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ id_token: string; access_token?: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.codeVerifier,
  });

  const response = await fetch(params.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Troca de código OIDC falhou (HTTP ${response.status}): ${text}`);
  }

  return response.json();
}
