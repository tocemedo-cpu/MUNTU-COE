import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { csrfCookieHeader, generateCsrfToken } from "@/lib/csrf";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import { createSessionToken, sessionCookieHeader, type AccessLevel } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { loginSchema, parseJsonBody } from "@/lib/validation";

// Sem isto, o login era brute-forceable: qualquer número de tentativas
// por IP, sem limite nenhum.
const LOGIN_LIMIT = 15;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  if (isRateLimited(`login:${clientIp(request)}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)) return rateLimitResponse();

  const db = getDb();
  const parsed = await parseJsonBody(request, loginSchema);
  if (!parsed.success) return parsed.response;
  const email = parsed.data.email.toLowerCase();

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user || !user.password || !(await verifyPassword(parsed.data.password, user.password))) {
    return Response.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: user.id,
    accessLevel: user.accessLevel as AccessLevel,
    companyId: user.companyId,
    supplierId: user.supplierId,
  });
  const { password: _password, ...safeUser } = user;
  const headers = new Headers();
  headers.append("Set-Cookie", sessionCookieHeader(token));
  // Headers.append (não .set) porque Set-Cookie é o único cabeçalho onde
  // vários valores têm de sobreviver separados — dois cookies distintos,
  // sessão e CSRF.
  headers.append("Set-Cookie", csrfCookieHeader(generateCsrfToken()));
  return Response.json({ user: safeUser }, { headers });
}
