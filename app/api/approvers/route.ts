import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/authz";

// Lista partilhada por dois dropdowns distintos: "Aprovador principal" no
// wizard de novo pedido (só informativo — requestCreateSchema#approver não
// impõe nada, a autorização real é por accessLevel+companyId em
// app/api/requests/[id]/route.ts) e "Atribuir responsável" nas
// Candidaturas (ver APPLICATION_REVIEW_ROLES). Um pedido pode ser
// decidido por um company_admin da própria empresa do requisitante, ou
// por qualquer coe_manager (equipa Muntu, que decide pedidos de qualquer
// empresa cliente); supplier_governance entra só para poder aparecer no
// segundo dropdown (candidaturas de fornecedor) — nunca decide pedidos.
// system_admin saiu desta lista com o redesenho de RBAC: já não aprova
// pedidos nem homologa (ver README §Personas e permissões).
export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);

  const conditions = [
    or(eq(users.accessLevel, "coe_manager"), eq(users.accessLevel, "supplier_governance")),
    session.companyId != null ? and(eq(users.accessLevel, "company_admin"), eq(users.companyId, session.companyId)) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role, accessLevel: users.accessLevel })
    .from(users)
    .where(or(...conditions))
    .orderBy(users.name);

  return Response.json({ approvers: rows });
}
