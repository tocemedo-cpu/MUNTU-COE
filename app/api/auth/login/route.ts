import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, type AccessLevel } from "@/lib/session";
import { loginSchema, parseJsonBody } from "@/lib/validation";

export async function POST(request: Request) {
  const db = getDb();
  const parsed = await parseJsonBody(request, loginSchema);
  if (!parsed.success) return parsed.response;
  const email = parsed.data.email.toLowerCase();

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user || !user.password || user.password !== parsed.data.password) {
    return Response.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: user.id,
    accessLevel: user.accessLevel as AccessLevel,
    companyId: user.companyId,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  const { password: _password, ...safeUser } = user;
  return Response.json({ user: safeUser });
}
