import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/authz";
import { publicOrigin } from "@/lib/request-origin";
import { DEFAULT_ROLE_LABEL, provisionUserWithoutPassword } from "@/lib/user-provisioning";
import { companyUserInviteSchema, parseJsonBody } from "@/lib/validation";

// Equipa da própria empresa — escopado ao companyId da sessão em ambos os
// métodos, nunca a um id vindo do corpo do pedido. Restrito a
// company_admin em middleware.ts (ROUTE_ACCESS, prefixo /api/company).
export async function GET(request: Request) {
  const session = getSession(request);
  const db = getDb();
  const rows = session.companyId != null ? await db.select().from(users).where(eq(users.companyId, session.companyId)) : [];

  return Response.json({ users: rows.map(({ password: _password, ...user }) => user) });
}

// Convite de um colega para a mesma empresa — cria sem palavra-passe e
// envia o e-mail de "definir palavra-passe", mesmo padrão da homologação
// e de POST /api/admin/users. Só pode ligar accessLevel a "requester" ou
// "company_admin", nunca a "supplier"/"coe_manager"/"system_admin" — a
// validação de zod já impede o valor de chegar aqui, isto é defesa em
// profundidade caso essa lista mude sem se rever este ficheiro.
export async function POST(request: Request) {
  const session = getSession(request);
  if (session.companyId == null) {
    return Response.json({ error: "A sua conta não está ligada a nenhuma empresa." }, { status: 400 });
  }

  const parsed = await parseJsonBody(request, companyUserInviteSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;
  if (payload.accessLevel !== "requester" && payload.accessLevel !== "company_admin") {
    return Response.json({ error: "Nível de acesso inválido para um convite de equipa." }, { status: 400 });
  }

  const db = getDb();
  const email = payload.email.trim().toLowerCase();
  const [existingUser] = await db.select().from(users).where(eq(users.email, email));
  if (existingUser) {
    return Response.json({ error: `Já existe um utilizador com o e-mail ${email}.` }, { status: 409 });
  }

  const origin = publicOrigin(request);
  const newUser = await provisionUserWithoutPassword(
    db,
    {
      name: payload.name.trim(),
      email,
      role: DEFAULT_ROLE_LABEL[payload.accessLevel],
      accessLevel: payload.accessLevel,
      companyId: session.companyId,
    },
    origin
  );

  const { password: _password, ...safeUser } = newUser;
  return Response.json({ user: safeUser }, { status: 201 });
}
