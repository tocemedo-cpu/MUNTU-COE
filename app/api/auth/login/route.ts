import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export async function POST(request: Request) {
  const db = getDb();
  const payload = (await request.json()) as { email?: string; password?: string };
  const email = payload.email?.trim().toLowerCase() ?? "";

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user || user.password !== payload.password) {
    return Response.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const { password: _password, ...safeUser } = user;
  return Response.json({ user: safeUser });
}
