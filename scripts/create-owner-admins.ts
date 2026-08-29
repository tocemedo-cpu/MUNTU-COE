import "dotenv/config";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { hashPassword } from "../lib/password";

// Cria (ou actualiza o papel de) as duas contas reais dos donos da
// operação Muntu COE — não são dados de demonstração, por isso vivem
// aqui e não em db/seed-data.ts. Correr uma vez contra a base de dados
// real: `DATABASE_URL=... npx tsx scripts/create-owner-admins.ts`.
//
// Uma password inicial só é gerada e definida na primeira criação da
// conta; se a conta já existir, a password fica intocada (o dono pode
// sempre mudá-la depois em "Recuperar acesso" no ecrã de login) — assim
// correr o script outra vez nunca desfaz uma troca de password já feita.
const ACCOUNTS = [
  { email: "tocemedo@gmail.com", name: "Tocemedo", role: "COE Manager", accessLevel: "coe_manager" as const },
  { email: "zelyvaldog@gmail.com", name: "Zelyvaldog", role: "System Admin", accessLevel: "system_admin" as const },
];

function generatePassword(): string {
  // 16 caracteres alfanuméricos, suficiente para uma password inicial
  // que o dono muda através do fluxo normal de recuperação de acesso.
  return crypto.randomBytes(12).toString("base64url").slice(0, 16);
}

async function main() {
  for (const account of ACCOUNTS) {
    const [existing] = await db.select().from(users).where(eq(users.email, account.email));
    const initials = account.name.slice(0, 2).toUpperCase();

    if (existing) {
      await db
        .update(users)
        .set({ name: account.name, role: account.role, initials, accessLevel: account.accessLevel, companyId: null, supplierId: null, tenant: "Muntu COE" })
        .where(eq(users.id, existing.id));
      console.log(`${account.email}: já existia — papel/dados actualizados para ${account.accessLevel}. Password mantida.`);
      continue;
    }

    const password = generatePassword();
    await db.insert(users).values({
      name: account.name,
      email: account.email,
      password: await hashPassword(password),
      role: account.role,
      initials,
      tenant: "Muntu COE",
      companyId: null,
      supplierId: null,
      accessLevel: account.accessLevel,
    });
    console.log(`${account.email}: conta criada como ${account.accessLevel}. Password inicial: ${password}`);
  }
  console.log("\nGuarde as passwords acima agora — não ficam registadas em mais lado nenhum. Cada dono pode mudá-la em \"Recuperar acesso\" no ecrã de login.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
