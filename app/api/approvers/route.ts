import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/authz";

// Lista de aprovadores reais para o passo 3 do wizard de novo pedido —
// substitui o dropdown antigo com três nomes fixos no código. Um pedido
// pode ser decidido por um company_admin da própria empresa do
// requisitante, ou por qualquer coe_manager/system_admin (equipa Muntu,
// que decide pedidos de qualquer empresa cliente) — mesmo âmbito já
// imposto por requestActionSchema/forbidUnless em
// app/api/requests/[id]/route.ts.
export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  const conditions = [
    or(eq(users.accessLevel, "coe_manager"), eq(users.accessLevel, "system_admin")),
    session.companyId != null ? and(eq(users.accessLevel, "company_admin"), eq(users.companyId, session.companyId)) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role, accessLevel: users.accessLevel })
    .from(users)
    .where(or(...conditions))
    .orderBy(users.name);

  return Response.json({ approvers: rows });
}
