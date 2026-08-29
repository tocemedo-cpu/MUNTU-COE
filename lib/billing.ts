import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { billingRates, clientInvoiceLines, clientInvoices, companies, invoices, purchaseOrders } from "@/db/schema";
import { isUniqueViolation } from "./db-errors";

export { classifyPoTier, classifyInvoiceTier, type PoTier, type InvoiceTier } from "./billing-tiers";

const RATE_LABELS: Record<string, string> = {
  po_automatico: "PO automático/catalogado",
  po_standard: "PO standard assistido",
  po_complexo: "PO complexo/urgente",
  invoice_limpa: "Factura limpa (3-way match)",
  invoice_assistida: "Factura standard assistida",
  invoice_excecao: "Factura com excepção/disputa",
};

// Pontos médios dos intervalos indicativos do Estudo de Viabilidade
// §32.4, usados apenas se `billing_rates` ainda não tiver sido semeada.
const FALLBACK_RATES: Record<string, number> = {
  po_automatico: 7000,
  po_standard: 10500,
  po_complexo: 26500,
  invoice_limpa: 3750,
  invoice_assistida: 5500,
  invoice_excecao: 11500,
};

type Db = ReturnType<typeof getDb>;

async function loadRateLookup(db: Db) {
  const rows = await db.select().from(billingRates);
  const map = new Map(rows.map((row) => [row.key, row.amount]));
  return (key: string) => map.get(key) ?? FALLBACK_RATES[key] ?? 0;
}

export async function generateClientInvoice(params: {
  companyId: number;
  periodStart: string;
  periodEnd: string;
  scope: "parcial" | "total";
  generatedBy: "automatico" | "manual";
}) {
  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, params.companyId));
  if (!company) throw new Error("Empresa não encontrada");

  const rate = await loadRateLookup(db);
  const start = new Date(params.periodStart);
  const end = new Date(params.periodEnd);

  const periodPos = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.companyId, params.companyId), gte(purchaseOrders.createdAt, start), lte(purchaseOrders.createdAt, end)));

  const periodInvoices = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.companyId, params.companyId), gte(invoices.createdAt, start), lte(invoices.createdAt, end)));

  const lines: { kind: "retainer" | "po" | "invoice"; referenceId: string | null; tier: string | null; description: string; amount: number }[] = [];

  if (company.retainerAmount > 0) {
    lines.push({
      kind: "retainer",
      referenceId: null,
      tier: null,
      description: `Retainer mensal — ${params.periodStart} a ${params.periodEnd}`,
      amount: company.retainerAmount,
    });
  }
  for (const po of periodPos) {
    const key = `po_${po.tier}`;
    lines.push({ kind: "po", referenceId: po.id, tier: po.tier, description: `${po.id} — ${RATE_LABELS[key] ?? po.tier}`, amount: rate(key) });
  }
  for (const invoice of periodInvoices) {
    const key = `invoice_${invoice.tier}`;
    lines.push({
      kind: "invoice",
      referenceId: invoice.id,
      tier: invoice.tier,
      description: `${invoice.id} — ${RATE_LABELS[key] ?? invoice.tier}`,
      amount: rate(key),
    });
  }

  const sum = (kind: string) => lines.filter((line) => line.kind === kind).reduce((total, line) => total + line.amount, 0);
  const retainerAmount = sum("retainer");
  const poAmount = sum("po");
  const invoiceAmount = sum("invoice");
  const totalAmount = retainerAmount + poAmount + invoiceAmount;

  const created = await insertClientInvoiceWithGeneratedId(db, {
    companyId: params.companyId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    scope: params.scope,
    status: "pendente_aprovacao",
    generatedBy: params.generatedBy,
    retainerAmount,
    poAmount,
    invoiceAmount,
    totalAmount,
  });

  if (lines.length) {
    await db.insert(clientInvoiceLines).values(lines.map((line) => ({ ...line, clientInvoiceId: created.id })));
  }

  return created;
}

type NewClientInvoiceValues = Omit<typeof clientInvoices.$inferInsert, "id">;

// Um id baseado em COUNT(*) colide assim que a tabela tem qualquer linha
// fora dessa sequência (dados semeados, facturas apagadas, ou a mesma
// contagem lida por duas chamadas concorrentes — ex.: o cron mensal a
// gerar facturas para várias empresas ao mesmo tempo) — mesma classe de
// bug já corrigida para pedidos, tickets de suporte, candidaturas e POs.
// Sorteia um id e só volta a tentar no caso raro de colisão real.
async function insertClientInvoiceWithGeneratedId(db: Db, values: NewClientInvoiceValues) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `COB-${new Date().getFullYear()}-${1000 + Math.floor(Math.random() * 9000)}`;
    try {
      const [created] = await db.insert(clientInvoices).values({ id, ...values }).returning();
      return created;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }
  throw new Error("Não foi possível gerar um id de factura de cliente único");
}
