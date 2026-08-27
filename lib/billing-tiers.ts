// Classificação pura de tier — sem dependência de base de dados, para
// poder ser usada tanto por lib/billing.ts (que faz IO) como por
// db/seed-data.ts (que não deve importar nada que puxe @/db, sob pena de
// import circular com db/index.ts).

export type PoTier = "automatico" | "standard" | "complexo";
export type InvoiceTier = "limpa" | "assistida" | "excecao";

/**
 * Classificação a partir do "Tipo de transacção" escolhido no wizard de
 * novo pedido — Estudo de Viabilidade §32.4. "PO catalogado" é um tipo
 * novo (ver requestCreateSchema) para cobrir o tier automático, que antes
 * não tinha correspondência nas opções do wizard.
 */
export function classifyPoTier(requestType: string): PoTier {
  if (requestType === "Compra urgente") return "complexo";
  if (requestType === "PO catalogado") return "automatico";
  return "standard"; // PO standard, Serviço técnico, Contrato / Call-off
}

export function classifyInvoiceTier(invoice: { match: string; status: string }): InvoiceTier {
  if (invoice.status === "Excepção") return "excecao";
  if (invoice.match === "3-way match") return "limpa";
  return "assistida";
}
