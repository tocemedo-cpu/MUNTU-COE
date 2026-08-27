import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export async function GET(request: Request) {
  const userId = Number(request.headers.get("x-muntu-user-id"));
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (!user) {
    return Response.json({ error: "Utilizador não encontrado" }, { status: 404 });
  }

  const { password: _password, ...safeUser } = user;
  return Response.json({ user: safeUser });
}
