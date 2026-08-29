import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { generateJti, signPayload } from "@/lib/session";
import { parseJsonBody, passwordResetRequestSchema } from "@/lib/validation";

const RESET_TOKEN_TTL_SECONDS = 30 * 60; // 30 minutos

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, passwordResetRequestSchema);
  if (!parsed.success) return parsed.response;
  const email = parsed.data.email.toLowerCase();

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));

  // Só envia se a conta existir e tiver password local (contas federadas
  // por SSO não têm password para repor por aqui). A resposta é sempre a
  // mesma nos dois casos — nunca revela se um e-mail tem conta ou não.
  if (user?.password) {
    const token = await signPayload({ userId: user.id, purpose: "password_reset", jti: generateJti() }, RESET_TOKEN_TTL_SECONDS);
    const origin = new URL(request.url).origin;
    const resetUrl = `${origin}/?reset_token=${encodeURIComponent(token)}#login`;
    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (error) {
      console.error("Falha ao enviar e-mail de recuperação de acesso:", error);
    }
  }

  return Response.json({ ok: true });
}
