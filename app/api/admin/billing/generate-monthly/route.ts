import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { generateClientInvoice } from "@/lib/billing";

/**
 * Geração automática mensal — pensada para ser chamada por um agendador
 * externo (Render Cron Job, GitHub Actions, cron-job.org, ...), não por
 * uma sessão de utilizador. Por isso está isenta do middleware de sessão
 * (ver PUBLIC_API_PATHS) e usa o seu próprio segredo (CRON_SECRET) em vez
 * de cookie. Sem CRON_SECRET definido, recusa sempre — nunca corre "aberta".
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET não está configurado no servidor." }, { status: 501 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const now = new Date();
  const periodStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
  const periodStart = periodStartDate.toISOString().slice(0, 10);
  const periodEnd = periodEndDate.toISOString().slice(0, 10);

  const db = getDb();
  const allCompanies = await db.select().from(companies);

  const results = [];
  for (const company of allCompanies) {
    try {
      const created = await generateClientInvoice({
        companyId: company.id,
        periodStart,
        periodEnd,
        scope: "total",
        generatedBy: "automatico",
      });
      results.push({ companyId: company.id, clientInvoiceId: created.id, status: "gerada" });
    } catch (error) {
      results.push({ companyId: company.id, status: "erro", error: error instanceof Error ? error.message : String(error) });
    }
  }

  return Response.json({ periodStart, periodEnd, results });
}
