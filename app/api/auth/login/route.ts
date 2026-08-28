import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSessionToken, sessionCookieHeader, type AccessLevel } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { loginSchema, parseJsonBody } from "@/lib/validation";

export async function POST(request: Request) {
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
  return Response.json({ user: safeUser }, { headers: { "Set-Cookie": sessionCookieHeader(token) } });
}
