import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { verifyPayload } from "@/lib/session";
import { parseJsonBody, passwordResetConfirmSchema } from "@/lib/validation";

type ResetTokenPayload = { userId: number; purpose: string; exp: number };

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, passwordResetConfirmSchema);
  if (!parsed.success) return parsed.response;

  const payload = await verifyPayload<ResetTokenPayload>(parsed.data.token);
  if (!payload || payload.purpose !== "password_reset" || !Number.isFinite(payload.userId)) {
    return Response.json({ error: "Link de recuperação inválido ou expirado" }, { status: 400 });
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId));
  if (!user || !user.password) {
    return Response.json({ error: "Link de recuperação inválido ou expirado" }, { status: 400 });
  }

  const hashed = await hashPassword(parsed.data.password);
  await db.update(users).set({ password: hashed }).where(eq(users.id, user.id));

  return Response.json({ ok: true });
}
