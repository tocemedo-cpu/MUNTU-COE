export type AccessLevel = "system_admin" | "coe_manager" | "analyst" | "supplier" | "company_admin" | "requester";

export type SessionPayload = {
  userId: number;
  accessLevel: AccessLevel;
  companyId: number | null;
  supplierId: number | null;
  exp: number;
};

const SESSION_COOKIE_NAME = "muntu_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

declare global {
  var __muntuSessionSecret: Uint8Array | undefined;
}

function getSecretBytes(): Uint8Array {
  if (process.env.SESSION_SECRET) {
    return new TextEncoder().encode(process.env.SESSION_SECRET);
  }
  // Sem SESSION_SECRET definido, gera-se um segredo aleatório por processo.
  // As sessões continuam a ser válidas e não-adivinháveis, só não sobrevivem
  // a um reinício/redeploy. Definir SESSION_SECRET evita esse logout global.
  if (!globalThis.__muntuSessionSecret) {
    globalThis.__muntuSessionSecret = crypto.getRandomValues(new Uint8Array(32));
  }
  return globalThis.__muntuSessionSecret;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", getSecretBytes() as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Assina um payload JSON qualquer com expiração — primitiva reutilizada
 * pela sessão principal e pelo estado CSRF/PKCE do fluxo de SSO. */
export async function signPayload<T extends object>(payload: T, ttlSeconds: number): Promise<string> {
  const withExpiry = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(withExpiry)));
  const key = await getKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload) as BufferSource);
  return `${encodedPayload}.${toBase64Url(signature)}`;
}

export async function verifyPayload<T extends { exp: number }>(token: string | undefined | null): Promise<T | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const encodedPayload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const key = await getKey();
  const expectedSignature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload) as BufferSource
  );
  if (!timingSafeEqual(toBase64Url(expectedSignature), signature)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as T;
    if (!Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSessionToken(claims: Omit<SessionPayload, "exp">): Promise<string> {
  return signPayload(claims, SESSION_TTL_SECONDS);
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  const payload = await verifyPayload<SessionPayload>(token);
  if (!payload || !Number.isFinite(payload.userId)) return null;
  return payload;
}

/** Cabeçalho Set-Cookie para a sessão — construído directamente em vez de
 * usar `cookies()` de "next/headers", para que as rotas de login/logout
 * sejam funções Request→Response simples, testáveis sem um pedido Next.js
 * a decorrer (ver tests/integration/auth.test.ts). */
export function sessionCookieHeader(token: string): string {
  const attrs = [`${SESSION_COOKIE_NAME}=${token}`, "Path=/", `Max-Age=${SESSION_TTL_SECONDS}`, "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS };
