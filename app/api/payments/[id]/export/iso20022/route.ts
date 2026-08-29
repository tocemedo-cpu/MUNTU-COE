import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, invoices, paymentBatches, suppliers } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { buildPain001Xml } from "@/lib/iso20022";
import { contentDispositionHeader } from "@/lib/uploads";

/**
 * Exportação ISO 20022 (pain.001) para um lote de pagamento —
 * `payment_batches` nunca teve linhas próprias (é um agregado
 * `count`/`value` sem ligação a facturas concretas), por isso as
 * transacções do ficheiro vêm das facturas validadas (`status =
 * "Validada"`, já com 3-way match) da mesma empresa do lote — a
 * interpretação real de "o que está pronto a pagar" que este modelo
 * suporta, sem inventar uma tabela de ligação nova.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager", "system_admin"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const [batch] = await db.select().from(paymentBatches).where(eq(paymentBatches.id, id));
  if (!batch) return Response.json({ error: "Lote não encontrado" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel === "company_admin" && batch.companyId !== session.companyId) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }
  if (batch.companyId == null) {
    return Response.json({ error: "Lote sem empresa associada — não é possível exportar." }, { status: 400 });
  }

  const [company] = await db.select().from(companies).where(eq(companies.id, batch.companyId));
  if (!company) return Response.json({ error: "Empresa não encontrada" }, { status: 404 });
  if (!company.iban || !company.bic) {
    return Response.json({ error: "Configure o IBAN/BIC da empresa antes de exportar (Administração → Empresas)." }, { status: 400 });
  }

  const eligibleInvoices = await db
    .select({ invoice: invoices, supplier: suppliers })
    .from(invoices)
    .innerJoin(suppliers, eq(invoices.supplierId, suppliers.id))
    .where(and(eq(invoices.companyId, batch.companyId), eq(invoices.status, "Validada")));

  if (eligibleInvoices.length === 0) {
    return Response.json({ error: "Não há facturas validadas para exportar." }, { status: 400 });
  }

  const missingSupplierBankDetails = eligibleInvoices.filter((row) => !row.supplier.iban || !row.supplier.bic);
  if (missingSupplierBankDetails.length > 0) {
    return Response.json(
      {
        error: "Um ou mais fornecedores das facturas a exportar não têm IBAN/BIC configurado.",
        invoiceIds: missingSupplierBankDetails.map((row) => row.invoice.id),
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const xml = buildPain001Xml({
    messageId: `${batch.id}-${now.getTime()}`,
    creationDateTime: now,
    executionDate: now,
    debtorName: company.name,
    debtorIban: company.iban,
    debtorBic: company.bic,
    transactions: eligibleInvoices.map((row) => ({
      endToEndId: row.invoice.id,
      amount: row.invoice.value,
      creditorName: row.supplier.name,
      creditorIban: row.supplier.iban as string,
      creditorBic: row.supplier.bic as string,
      remittanceInfo: `${row.invoice.id} — ${row.invoice.po}`,
    })),
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": contentDispositionHeader(`pain001-${batch.id}.xml`),
    },
  });
}
