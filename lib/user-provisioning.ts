import type { getDb } from "@/db";
import { users } from "@/db/schema";
import { sendWelcomeSetPasswordEmail } from "./mailer";
import { signPayload, type AccessLevel } from "./session";

const WELCOME_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias — mesmo prazo usado para repor palavra-passe

export function initialsFrom(name: string): string {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "US"
  );
}

// Título por omissão quando quem cria o utilizador não indica um — mesmos
// textos já usados em db/seed-data.ts e na homologação de candidaturas.
export const DEFAULT_ROLE_LABEL: Record<AccessLevel, string> = {
  system_admin: "System Admin",
  coe_manager: "COE Manager",
  analyst: "Analista (Buyer/AP)",
  supplier: "Fornecedor",
  company_admin: "Administrador da empresa",
  requester: "Requisitante",
};

export type ProvisionUserParams = {
  name: string;
  email: string;
  role: string;
  accessLevel: AccessLevel;
  companyId?: number | null;
  supplierId?: number | null;
};

// Cria um utilizador sem palavra-passe e envia o link de "definir
// palavra-passe" — o mesmo padrão usado pela homologação de candidaturas,
// agora também pela criação directa de utilizadores (System Admin) e pelo
// convite de colegas dentro da própria empresa (Administrador da
// empresa). Reaproveita a infra da recuperação de acesso (signPayload +
// /api/auth/password-reset/confirm), só muda o texto do e-mail — nunca
// falha por causa do e-mail (falha de envio fica só registada).
export async function provisionUserWithoutPassword(
  db: ReturnType<typeof getDb>,
  params: ProvisionUserParams,
  origin: string
) {
  const [newUser] = await db
    .insert(users)
    .values({
      name: params.name,
      email: params.email,
      password: null,
      role: params.role,
      initials: initialsFrom(params.name),
      accessLevel: params.accessLevel,
      companyId: params.companyId ?? null,
      supplierId: params.supplierId ?? null,
    })
    .returning();

  const welcomeToken = await signPayload({ userId: newUser.id, purpose: "password_reset" }, WELCOME_TOKEN_TTL_SECONDS);
  const setPasswordUrl = `${origin}/?reset_token=${encodeURIComponent(welcomeToken)}#login`;
  try {
    await sendWelcomeSetPasswordEmail(params.email, params.name, setPasswordUrl);
  } catch (error) {
    console.error("Falha ao enviar e-mail de boas-vindas:", error);
  }

  return newUser;
}
