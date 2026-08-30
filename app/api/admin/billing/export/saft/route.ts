import { and, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { clientInvoices, companies } from "@/db/schema";
import { buildSaftAgtXml } from "@/lib/saft";
import { contentDispositionHeader } from "@/lib/uploads";

const MUNTU_COMPANY_NAME = "Muntu Centre of Excellence, Lda";

/**
 * Exportação AGT/SAF-T — cobre as facturas de cliente (client_invoices,
 * já aprovadas) emitidas por Muntu num período, com a empresa devedora
 * como Customer SAF-T. Restrita a system_admin pelo prefixo /api/admin
 * (middleware.ts).
 *
 * `MUNTU_NIF` (env var, NIF da própria Muntu) é exigido — sem ele, a
 * rota recusa sempre, mesmo padrão de CRON_SECRET/BREVO_API_KEY: nunca
 * gera um ficheiro com o identificador do próprio emitente em falta.
 */
export async function GET(request: Request) {
  const muntuNif = process.env.MUNTU_NIF;
  if (!muntuNif) {
    return Response.json({ error: "MUNTU_NIF não está configurado no servidor." }, { status: 501 });
  }

  const { searchParams } = new URL(request.url);
  const periodStartParam = searchParams.get("periodStart");
  const periodEndParam = searchParams.get("periodEnd");
  if (!periodStartParam || !periodEndParam) {
    return Response.json({ error: "Indique periodStart e periodEnd (YYYY-MM-DD)." }, { status: 400 });
  }
  const periodStart = new Date(periodStartParam);
  const periodEnd = new Date(periodEndParam);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < periodStart) {
    return Response.json({ error: "Período inválido." }, { status: 400 });
  }

  const db = getDb();
  const eligibleInvoices = await db
    .select()
    .from(clientInvoices)
    .where(
      and(
        inArray(clientInvoices.status, ["aprovada", "enviada_contabilidade"]),
        gte(clientInvoices.periodStart, periodStartParam),
        lte(clientInvoices.periodEnd, periodEndParam)
      )
    );

  if (eligibleInvoices.length === 0) {
    return Response.json({ error: "Não há facturas aprovadas neste período." }, { status: 400 });
  }

  const companyIds = Array.from(new Set(eligibleInvoices.map((invoice) => invoice.companyId)));
  const companyRows = await db.select().from(companies).where(inArray(companies.id, companyIds));
  const companyById = new Map(companyRows.map((company) => [company.id, company]));

  const companiesMissingTaxId = companyIds.filter((id) => !companyById.get(id)?.taxId);
  if (companiesMissingTaxId.length > 0) {
    return Response.json(
      {
        error: "Uma ou mais empresas facturadas neste período não têm NIF configurado.",
        companyIds: companiesMissingTaxId,
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const xml = buildSaftAgtXml({
    companyTaxId: muntuNif,
    companyName: MUNTU_COMPANY_NAME,
    fiscalYear: periodEnd.getFullYear(),
    periodStart,
    periodEnd,
    dateCreated: now,
    customers: companyRows.map((company) => ({
      customerId: String(company.id),
      taxId: company.taxId as string,
      companyName: company.name,
    })),
    invoices: eligibleInvoices.map((invoice) => ({
      invoiceNo: invoice.id,
      invoiceDate: invoice.createdAt,
      customerId: String(invoice.companyId),
      grossTotal: invoice.totalAmount,
    })),
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": contentDispositionHeader(`saft-agt-${periodStartParam}-${periodEndParam}.xml`),
    },
  });
}
