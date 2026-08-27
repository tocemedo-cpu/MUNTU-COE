const SESSION_COOKIE_NAME = "muntu_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

declare global {
  // eslint-disable-next-line no-var
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

function toBase64Url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(userId: number): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${expires}`;
  const key = await getKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload) as BufferSource);
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<{ userId: number } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userIdStr, expiresStr, signature] = parts;

  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return null;

  const key = await getKey();
  const expectedSignature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${userIdStr}.${expiresStr}`) as BufferSource
  );
  if (!timingSafeEqual(toBase64Url(expectedSignature), signature)) return null;

  const userId = Number(userIdStr);
  if (!Number.isFinite(userId)) return null;
  return { userId };
}

export { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS };
