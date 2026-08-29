import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { classifyInvoiceTier } from "../lib/billing-tiers";
import { hashPassword } from "../lib/password";
import { computeRequestSlaDueAt } from "../lib/requests-sla";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const demoCompany = {
  name: "Operadora Atlântico, SA",
  domain: "operadora.ao",
  authMethod: "password" as const,
};

const demoUsers = [
  { name: "Ana Manuel", email: "ana.manuel@operadora.ao", password: "Muntu2026!", role: "Requisitante", initials: "AM", accessLevel: "requester" as const },
  { name: "João Sebastião", email: "joao.sebastiao@operadora.ao", password: "Muntu2026!", role: "Administrador da empresa", initials: "JS", accessLevel: "company_admin" as const },
  { name: "Marta Miguel", email: "marta.miguel@muntucoe.ao", password: "Muntu2026!", role: "COE Manager", initials: "MM", accessLevel: "coe_manager" as const },
  { name: "Sofia Neto", email: "sofia.neto@muntucoe.ao", password: "Muntu2026!", role: "Analista (Buyer/AP)", initials: "SN", accessLevel: "analyst" as const },
  { name: "Rui Domingos", email: "rui.domingos@muntucoe.ao", password: "Muntu2026!", role: "System Admin", initials: "RD", accessLevel: "system_admin" as const },
  { name: "Carlos Mateus", email: "carlos.mateus@kwanzaindustrial.ao", password: "Muntu2026!", role: "Fornecedor", initials: "CM", accessLevel: "supplier" as const },
];

// createdAt/decidedAt reais (não só o texto "submitted") para que o SLA%,
// o ciclo médio e a tendência mensal em Relatórios/Dashboard/Login sejam
// calculados a partir de dados verdadeiros em vez de números fixos no
// código — ver lib/requests-sla.ts. Datas espalhadas por 3 meses só para
// a demonstração ter alguma variação na tendência; o cálculo em si é real
// e funciona da mesma forma com qualquer dado.
const demoRequests = [
  {
    id: "REQ-2026-0814", subject: "Válvulas de controlo — Kizomba B", tower: "Requisition-to-PO", type: "PO standard", value: 84_000_000, status: "Aprovação", priority: "Alta", owner: "Carlos Mateus", sla: "03h 12m", stage: 2, submitted: "26 Ago, 09:14", supplier: "Kwanza Industrial", costCenter: "OFS-OPS-210",
    createdAt: new Date(Date.now() - 50 * 60 * 1000), decidedAt: null, // ainda por decidir, dentro do prazo
  },
  {
    id: "REQ-2026-0813", subject: "Inspecção NDT offshore", tower: "Serviços técnicos", type: "Compra urgente", value: 31_600_000, status: "Em execução", priority: "Alta", owner: "Marta Miguel", sla: "18h 40m", stage: 3, submitted: "25 Ago, 15:42", supplier: "Atlântico Integrity", costCenter: "INT-B15-105",
    createdAt: new Date("2026-08-27T10:00:00Z"), decidedAt: new Date("2026-08-27T13:00:00Z"), // decidido em 3h, dentro do prazo de 4h
  },
  {
    id: "REQ-2026-0812", subject: "Calibração de PRV — campanha Q3", tower: "PO-to-Receipt", type: "PO standard", value: 12_450_000, status: "Receção", priority: "Média", owner: "Domingos José", sla: "1d 04h", stage: 4, submitted: "24 Ago, 11:20", supplier: "Luanda Calibration Services", costCenter: "MAI-PRV-330",
    createdAt: new Date("2026-07-15T09:00:00Z"), decidedAt: new Date("2026-07-15T15:00:00Z"), // decidido em 6h, dentro do prazo de 8h
  },
  {
    id: "REQ-2026-0809", subject: "Consumíveis de manutenção", tower: "Invoice-to-Pay", type: "PO catalogado", value: 5_980_000, status: "Excepção", priority: "Média", owner: "Ana Manuel", sla: "Vencido 2h", stage: 6, submitted: "22 Ago, 08:05", supplier: "Mwangolé Supplies", costCenter: "MRO-BASE-090",
    createdAt: new Date("2026-07-05T08:00:00Z"), decidedAt: new Date("2026-07-06T14:00:00Z"), // decidido 30h depois, fora do prazo de 8h
  },
  {
    id: "REQ-2026-0804", subject: "Transporte de equipa para Soyo", tower: "Invoice-to-Pay", type: "PO standard", value: 3_200_000, status: "Pago", priority: "Normal", owner: "Ana Manuel", sla: "Concluído", stage: 7, submitted: "19 Ago, 13:37", supplier: "Norte Logística", costCenter: "LOG-SOY-011",
    createdAt: new Date("2026-06-10T13:00:00Z"), decidedAt: new Date("2026-06-10T23:00:00Z"), // decidido em 10h, dentro do prazo de 16h
  },
];

const demoSuppliers = [
  { name: "Kwanza Industrial", category: "Válvulas e MRO", passport: 96, risk: "Baixo", local: "92%", status: "Activo" },
  { name: "Atlântico Integrity", category: "NDT e Integridade", passport: 88, risk: "Baixo", local: "78%", status: "Activo" },
  { name: "Luanda Calibration Services", category: "Calibração", passport: 81, risk: "Médio", local: "100%", status: "Revisão" },
  { name: "Mwangolé Supplies", category: "Consumíveis", passport: 73, risk: "Médio", local: "85%", status: "Documentos" },
  { name: "Norte Logística", category: "Transporte", passport: 91, risk: "Baixo", local: "100%", status: "Activo" },
];

const demoPurchaseOrders = [
  { id: "PO-6100432", supplier: "Kwanza Industrial", description: "Válvulas de controlo", value: 84_000_000, status: "Expediting", nextAction: "02 Set", tier: "standard" as const },
  { id: "PO-6100424", supplier: "Atlântico Integrity", description: "Inspecção NDT offshore", value: 31_600_000, status: "Confirmado", nextAction: "30 Ago", tier: "complexo" as const },
  { id: "PO-6100411", supplier: "Mwangolé Supplies", description: "Consumíveis MRO", value: 5_980_000, status: "Excepção", nextAction: "Hoje", tier: "automatico" as const },
  { id: "PO-6100380", supplier: "Luanda Calibration Services", description: "Calibração PRV", value: 12_450_000, status: "Entregue", nextAction: "Receber", tier: "standard" as const },
];

const demoReceipts = [
  { po: "PO-6100380", description: "Calibração PRV — campanha Q3", supplier: "Luanda Calibration Services", value: 12_450_000, progress: 100, status: "A confirmar" },
  { po: "PO-6100432", description: "Válvulas de controlo — lote 1/2", supplier: "Kwanza Industrial", value: 42_000_000, progress: 50, status: "02 Set" },
  { po: "PO-6100424", description: "Inspecção NDT — mobilização", supplier: "Atlântico Integrity", value: 9_480_000, progress: 30, status: "Em curso" },
];

const demoInvoices = [
  { id: "FT-2026-1198", supplier: "Kwanza Industrial", po: "PO-6100432", value: 42_000_000, match: "3-way match", status: "Validada", due: "04 Set" },
  { id: "FT-2026-1192", supplier: "Mwangolé Supplies", po: "PO-6100411", value: 5_980_000, match: "Preço divergente", status: "Excepção", due: "Hoje" },
  { id: "FT-2026-1186", supplier: "Norte Logística", po: "PO-6100398", value: 3_200_000, match: "3-way match", status: "Pago", due: "Concluído" },
  { id: "FT-2026-1179", supplier: "Luanda Calibration Services", po: "PO-6100380", value: 12_450_000, match: "Receção em falta", status: "Pendente", due: "29 Ago" },
];

// `cause` alimenta o relatório real "Excepções por causa" em Relatórios
// (antes uma lista de percentagens fixa no código); `createdAt` alimenta o
// "Idade" real mostrado na lista (antes um texto tipo "2h 14m" gravado
// uma vez e nunca mais actualizado — ver formatElapsedPt em app/page.tsx).
const demoExceptions = [
  { id: "EXC-0264", title: "Preço da factura diverge do PO em 4,8%", ref: "FT-2026-1192 • PO-6100411", owner: "Comprador", cause: "Preço divergente", impact: "AOA 286 000", createdAt: new Date(Date.now() - (2 * 60 + 14) * 60 * 1000) },
  { id: "EXC-0261", title: "Recepção de serviço não registada", ref: "FT-2026-1179 • PO-6100380", owner: "Requisitante", cause: "Recepção em falta", impact: "AOA 12 450 000", createdAt: new Date(Date.now() - (7 * 60 + 38) * 60 * 1000) },
  { id: "EXC-0258", title: "Certificado fiscal expirado", ref: "Supplier Passport • Mwangolé Supplies", owner: "Fornecedor", cause: "Dados fiscais", impact: "Bloqueio de pagamento", createdAt: new Date(Date.now() - 27 * 60 * 60 * 1000) },
  { id: "EXC-0270", title: "Quantidade recebida inferior à da PO — lote 2", ref: "PO-6100432", owner: "Comprador", cause: "Quantidade", impact: "AOA 4 200 000", createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
  { id: "EXC-0245", title: "Justificativo em falta para despesa adicional", ref: "REQ-2026-0809", owner: "Requisitante", cause: "Outros", impact: "AOA 850 000", createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), resolved: true },
];

const demoPaymentBatches = [
  { id: "PAY-2026-035", date: "28 Ago 2026", count: 8, value: 68_450_000, status: "Pronto" },
  { id: "PAY-2026-034", date: "25 Ago 2026", count: 11, value: 102_980_000, status: "Pago", released: true },
  { id: "PAY-2026-033", date: "21 Ago 2026", count: 6, value: 44_200_000, status: "Pago", released: true },
];

const demoDocuments = [
  { name: "Contrato_MRO_2026.pdf", type: "Contrato", request: "REQ-2026-0814", owner: "Carlos Mateus", version: "v3", updated: "Há 18 min" },
  { name: "Certificados_PRV_Q3.zip", type: "Certificação", request: "REQ-2026-0812", owner: "Marta Miguel", version: "v1", updated: "Hoje, 10:21" },
  { name: "Acta_Rececao_PO6100380.pdf", type: "Receção", request: "REQ-2026-0812", owner: "Domingos José", version: "v2", updated: "Ontem" },
  { name: "Parecer_Fiscal_AOA.pdf", type: "Compliance", request: "POL-2026-04", owner: "Muntu Legal", version: "v5", updated: "22 Ago" },
];

export async function seedIfEmpty(db: Db) {
  let company = (await db.select().from(schema.companies).where(eq(schema.companies.domain, demoCompany.domain)))[0];
  if (!company) {
    [company] = await db.insert(schema.companies).values(demoCompany).returning();
  }

  let supplierRows = await db.select().from(schema.suppliers);
  if (supplierRows.length === 0) {
    supplierRows = await db.insert(schema.suppliers).values(demoSuppliers).returning();
  }
  const supplierIdByName = new Map(supplierRows.map((s) => [s.name, s.id]));

  const existingUsers = await db.select().from(schema.users).limit(1);
  if (existingUsers.length === 0) {
    const usersToInsert = await Promise.all(
      demoUsers.map(async (user) => ({
        ...user,
        password: await hashPassword(user.password),
        companyId: user.accessLevel === "company_admin" || user.accessLevel === "requester" ? company.id : null,
        supplierId: user.accessLevel === "supplier" ? (supplierIdByName.get("Kwanza Industrial") ?? null) : null,
      }))
    );
    await db.insert(schema.users).values(usersToInsert).onConflictDoNothing();
  }

  // Verifica um id de pedido de demonstração concreto, não só "a tabela
  // tem alguma linha" — outro código (ex.: testes de integração) também
  // insere em `requests` com ids próprios, o que faria este portão dar
  // um falso positivo e saltar a semeadura do resto do dataset de demo.
  const existingDemoRequest = await db.select().from(schema.requests).where(eq(schema.requests.id, demoRequests[0].id));
  if (existingDemoRequest.length === 0) {
    const anaManuel = (await db.select().from(schema.users).where(eq(schema.users.email, "ana.manuel@operadora.ao")))[0];

    await db
      .insert(schema.requests)
      .values(
        demoRequests.map((request) => ({
          ...request,
          companyId: company.id,
          ownerUserId: request.owner === "Ana Manuel" ? anaManuel?.id : null,
          slaDueAt: computeRequestSlaDueAt(request.priority, request.createdAt),
        }))
      )
      .onConflictDoNothing();
    await db
      .insert(schema.purchaseOrders)
      .values(demoPurchaseOrders.map((po) => ({ ...po, companyId: company.id, supplierId: supplierIdByName.get(po.supplier) ?? null })))
      .onConflictDoNothing();
    await db
      .insert(schema.receipts)
      .values(
        demoReceipts.map((receipt) => ({
          ...receipt,
          companyId: company.id,
          supplierId: supplierIdByName.get(receipt.supplier) ?? null,
        }))
      );
    await db
      .insert(schema.invoices)
      .values(
        demoInvoices.map((invoice) => ({
          ...invoice,
          companyId: company.id,
          supplierId: supplierIdByName.get(invoice.supplier) ?? null,
          tier: classifyInvoiceTier(invoice),
        }))
      )
      .onConflictDoNothing();
    await db
      .insert(schema.exceptions)
      .values(demoExceptions.map((exception) => ({ ...exception, companyId: company.id })))
      .onConflictDoNothing();
    await db
      .insert(schema.paymentBatches)
      .values(demoPaymentBatches.map((batch) => ({ ...batch, companyId: company.id })))
      .onConflictDoNothing();
    await db.insert(schema.documents).values(demoDocuments);
  }

  const existingRates = await db.select().from(schema.billingRates).limit(1);
  if (existingRates.length === 0) {
    await db
      .insert(schema.billingRates)
      .values([
        { key: "po_automatico", label: "PO automático/catalogado", amount: 7_000 },
        { key: "po_standard", label: "PO standard assistido", amount: 10_500 },
        { key: "po_complexo", label: "PO complexo/urgente", amount: 26_500 },
        { key: "invoice_limpa", label: "Factura limpa (3-way match)", amount: 3_750 },
        { key: "invoice_assistida", label: "Factura standard assistida", amount: 5_500 },
        { key: "invoice_excecao", label: "Factura com excepção/disputa", amount: 11_500 },
      ])
      .onConflictDoNothing();
  }
}
