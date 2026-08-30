import { SESSION_TTL_SECONDS } from "@/lib/session";

const CSRF_COOKIE_NAME = "muntu_csrf";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Token novo para o cookie CSRF — gerado sempre que uma sessão é criada
 * (login por password, SSO), ao lado do cookie de sessão. */
export function generateCsrfToken(): string {
  return crypto.randomUUID();
}

/** Ao contrário do cookie de sessão (HttpOnly), este tem de ser legível
 * por JS — é o "double-submit": o frontend lê-o e reenvia-o como
 * cabeçalho x-csrf-token em cada pedido que muda estado (ver app/page.tsx
 * #api()). Um site atacante consegue fazer o browser da vítima enviar o
 * cookie automaticamente (é isso que SameSite=Lax não bloqueia em todos
 * os casos), mas nunca consegue lê-lo para o pôr também no cabeçalho —
 * por isso os dois terem de bater certo é que prova que o pedido partiu
 * mesmo deste site. */
export function csrfCookieHeader(token: string): string {
  const attrs = [`${CSRF_COOKIE_NAME}=${token}`, "Path=/", `Max-Age=${SESSION_TTL_SECONDS}`, "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

export function clearCsrfCookieHeader(): string {
  return `${CSRF_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Compara o valor do cookie com o do cabeçalho — pura, para ser testável
 * sem um NextRequest a decorrer (ver middleware.ts, que é quem extrai os
 * dois valores reais a partir do pedido). */
export function verifyCsrfToken(cookieValue: string | undefined | null, headerValue: string | undefined | null): boolean {
  if (!cookieValue || !headerValue) return false;
  return timingSafeEqual(cookieValue, headerValue);
}

export { CSRF_COOKIE_NAME };
