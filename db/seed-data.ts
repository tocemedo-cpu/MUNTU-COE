import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const demoUsers = [
  { name: "Ana Manuel", email: "ana.manuel@operadora.ao", password: "Muntu2026!", role: "Cliente comprador", initials: "AM" },
  { name: "João Sebastião", email: "joao.sebastiao@operadora.ao", password: "Muntu2026!", role: "Aprovador", initials: "JS" },
  { name: "Marta Miguel", email: "marta.miguel@muntucoe.ao", password: "Muntu2026!", role: "Operações Muntu", initials: "MM" },
  { name: "Carlos Mateus", email: "carlos.mateus@kwanzaindustrial.ao", password: "Muntu2026!", role: "Fornecedor", initials: "CM" },
];

const demoRequests = [
  { id: "REQ-2026-0814", subject: "Válvulas de controlo — Kizomba B", tower: "Requisition-to-PO", value: 84_000_000, status: "Aprovação", priority: "Alta", owner: "Carlos Mateus", sla: "03h 12m", stage: 2, submitted: "26 Ago, 09:14", supplier: "Kwanza Industrial", costCenter: "OFS-OPS-210" },
  { id: "REQ-2026-0813", subject: "Inspecção NDT offshore", tower: "Serviços técnicos", value: 31_600_000, status: "Em execução", priority: "Alta", owner: "Marta Miguel", sla: "18h 40m", stage: 3, submitted: "25 Ago, 15:42", supplier: "Atlântico Integrity", costCenter: "INT-B15-105" },
  { id: "REQ-2026-0812", subject: "Calibração de PRV — campanha Q3", tower: "PO-to-Receipt", value: 12_450_000, status: "Receção", priority: "Média", owner: "Domingos José", sla: "1d 04h", stage: 4, submitted: "24 Ago, 11:20", supplier: "Luanda Calibration Services", costCenter: "MAI-PRV-330" },
  { id: "REQ-2026-0809", subject: "Consumíveis de manutenção", tower: "Invoice-to-Pay", value: 5_980_000, status: "Excepção", priority: "Média", owner: "Ana Manuel", sla: "Vencido 2h", stage: 6, submitted: "22 Ago, 08:05", supplier: "Mwangolé Supplies", costCenter: "MRO-BASE-090" },
  { id: "REQ-2026-0804", subject: "Transporte de equipa para Soyo", tower: "Invoice-to-Pay", value: 3_200_000, status: "Pago", priority: "Normal", owner: "Ana Manuel", sla: "Concluído", stage: 7, submitted: "19 Ago, 13:37", supplier: "Norte Logística", costCenter: "LOG-SOY-011" },
];

const demoSuppliers = [
  { name: "Kwanza Industrial", category: "Válvulas e MRO", passport: 96, risk: "Baixo", local: "92%", status: "Activo" },
  { name: "Atlântico Integrity", category: "NDT e Integridade", passport: 88, risk: "Baixo", local: "78%", status: "Activo" },
  { name: "Luanda Calibration Services", category: "Calibração", passport: 81, risk: "Médio", local: "100%", status: "Revisão" },
  { name: "Mwangolé Supplies", category: "Consumíveis", passport: 73, risk: "Médio", local: "85%", status: "Documentos" },
  { name: "Norte Logística", category: "Transporte", passport: 91, risk: "Baixo", local: "100%", status: "Activo" },
];

const demoPurchaseOrders = [
  { id: "PO-6100432", supplier: "Kwanza Industrial", description: "Válvulas de controlo", value: 84_000_000, status: "Expediting", nextAction: "02 Set" },
  { id: "PO-6100424", supplier: "Atlântico Integrity", description: "Inspecção NDT offshore", value: 31_600_000, status: "Confirmado", nextAction: "30 Ago" },
  { id: "PO-6100411", supplier: "Mwangolé Supplies", description: "Consumíveis MRO", value: 5_980_000, status: "Excepção", nextAction: "Hoje" },
  { id: "PO-6100380", supplier: "Luanda Calibration Services", description: "Calibração PRV", value: 12_450_000, status: "Entregue", nextAction: "Receber" },
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

const demoExceptions = [
  { id: "EXC-0264", title: "Preço da factura diverge do PO em 4,8%", ref: "FT-2026-1192 • PO-6100411", owner: "Comprador", age: "2h 14m", impact: "AOA 286 000" },
  { id: "EXC-0261", title: "Recepção de serviço não registada", ref: "FT-2026-1179 • PO-6100380", owner: "Requisitante", age: "7h 38m", impact: "AOA 12 450 000" },
  { id: "EXC-0258", title: "Certificado fiscal expirado", ref: "Supplier Passport • Mwangolé Supplies", owner: "Fornecedor", age: "1d 03h", impact: "Bloqueio de pagamento" },
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
  const existingUsers = await db.select().from(schema.users).limit(1);
  if (existingUsers.length === 0) {
    await db.insert(schema.users).values(demoUsers).onConflictDoNothing();
  }

  const existingRequests = await db.select().from(schema.requests).limit(1);
  if (existingRequests.length === 0) {
    await db.insert(schema.requests).values(demoRequests).onConflictDoNothing();
    await db.insert(schema.suppliers).values(demoSuppliers).onConflictDoNothing();
    await db.insert(schema.purchaseOrders).values(demoPurchaseOrders).onConflictDoNothing();
    await db.insert(schema.receipts).values(demoReceipts);
    await db.insert(schema.invoices).values(demoInvoices).onConflictDoNothing();
    await db.insert(schema.exceptions).values(demoExceptions).onConflictDoNothing();
    await db.insert(schema.paymentBatches).values(demoPaymentBatches).onConflictDoNothing();
    await db.insert(schema.documents).values(demoDocuments);
  }
}
