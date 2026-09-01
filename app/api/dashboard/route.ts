import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { requests } from "@/db/schema";
import { getSession } from "@/lib/authz";

const stages = ["Intake", "Validação", "Aprovação", "PO", "Receção", "Factura", "Excepção", "Pagamento"];

export async function GET(request: Request) {
  const db = getDb();
  const session = getSession(request);
  // company_admin só deve ver os números da sua própria empresa — sem
  // isto, o Dashboard mostrava a plataforma inteira mesmo para um cliente.
  // coe_manager/system_admin (os únicos outros níveis que chegam aqui,
  // ver ROUTE_ACCESS em middleware.ts) continuam a ver tudo, de propósito.
  const all =
    session.accessLevel === "company_admin" && session.companyId != null
      ? await db.select().from(requests).where(eq(requests.companyId, session.companyId))
      : await db.select().from(requests);

  const active = all.filter((item) => !["Pago", "Rejeitado"].includes(item.status)).length;
  const totalValue = all.reduce((sum, item) => sum + item.value, 0);
  const pipeline = stages.map((_, index) => all.filter((item) => item.stage === index).length);

  return Response.json({
    activeRequests: active,
    inApproval: all.filter((item) => item.status === "Aprovação").length,
    totalValueInFlow: totalValue,
    transactionCount: all.length,
    stages,
    pipeline,
    recent: [...all]
      .sort((a, b) => (a.submitted < b.submitted ? 1 : -1))
      .slice(0, 4),
  });
}
