// Regras puras da caixa de suporte — sem dependência de base de dados,
// para poderem ser testadas isoladamente (mesmo padrão de billing-tiers.ts).

export const SUPPORT_CATEGORIES = ["Geral", "Conta e acesso", "Facturação", "Pedidos e aprovações", "Fornecedores", "Outro"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_PRIORITIES = ["baixa", "normal", "alta", "urgente"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_STATUSES = ["aberto", "em_curso", "resolvido", "fechado"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

// Prazo-alvo de primeira resposta por prioridade, em horas.
const SLA_HOURS: Record<SupportPriority, number> = {
  urgente: 4,
  alta: 24,
  normal: 72,
  baixa: 120,
};

export function computeSlaDueAt(priority: SupportPriority, from: Date = new Date()): Date {
  return new Date(from.getTime() + SLA_HOURS[priority] * 60 * 60 * 1000);
}

export function isSlaBreached(slaDueAt: Date | string, status: SupportStatus, now: Date = new Date()): boolean {
  if (status === "resolvido" || status === "fechado") return false;
  return new Date(slaDueAt).getTime() < now.getTime();
}
