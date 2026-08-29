// Regras puras de SLA/ciclo dos pedidos — sem dependência de base de
// dados, testadas isoladamente (mesmo padrão de lib/support.ts). Estas
// funções são a única fonte dos números "SLA no prazo %" e "ciclo médio"
// mostrados em várias telas (Dashboard, Relatórios, Login, site público)
// — substituem vários valores fixos no código que existiam antes,
// mutuamente inconsistentes, sem nenhum vir de dados reais.

export const REQUEST_PRIORITIES = ["Alta", "Média", "Normal"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

// Prazo-alvo para a decisão (aprovar/rejeitar), em horas — mesmos valores
// já usados para preencher o campo de texto `requests.sla` na criação.
const REQUEST_SLA_HOURS: Record<RequestPriority, number> = {
  Alta: 4,
  Média: 8,
  Normal: 16,
};

export function computeRequestSlaDueAt(priority: string, from: Date = new Date()): Date {
  const hours = REQUEST_SLA_HOURS[priority as RequestPriority] ?? REQUEST_SLA_HOURS.Normal;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

// Decidido depois do prazo = incumprido. Ainda por decidir: incumprido só
// se já passou o prazo agora (continua "dentro do prazo" enquanto não
// vencer).
// Um pedido sem slaDueAt (linha antiga, anterior a esta coluna existir)
// nunca conta como incumprido — não há prazo real para comparar contra.
export function isRequestSlaBreached(slaDueAt: Date | string | null, decidedAt: Date | string | null, now: Date = new Date()): boolean {
  if (slaDueAt == null) return false;
  const due = new Date(slaDueAt).getTime();
  const comparedAt = decidedAt ? new Date(decidedAt).getTime() : now.getTime();
  return comparedAt > due;
}

export type RequestSlaRow = { createdAt: Date | string; slaDueAt: Date | string | null; decidedAt: Date | string | null };

export function computeSlaOnTimePct(items: RequestSlaRow[], now: Date = new Date()): number {
  if (items.length === 0) return 0;
  const onTime = items.filter((item) => !isRequestSlaBreached(item.slaDueAt, item.decidedAt, now)).length;
  return Math.round((onTime / items.length) * 100);
}

// Ciclo médio de decisão, em dias (1 casa decimal) — só conta pedidos já
// decididos (decidedAt definido). Um pedido ainda pendente não tem ciclo
// concluído para entrar na média.
export function computeAvgCycleDays(items: RequestSlaRow[]): number {
  const decided = items.filter((item): item is RequestSlaRow & { decidedAt: Date | string } => item.decidedAt != null);
  if (decided.length === 0) return 0;
  const totalMs = decided.reduce((sum, item) => sum + (new Date(item.decidedAt).getTime() - new Date(item.createdAt).getTime()), 0);
  const avgDays = totalMs / decided.length / (1000 * 60 * 60 * 24);
  return Math.round(avgDays * 10) / 10;
}

// Tempo entre o alerta inicial e o escalonamento para a liderança Muntu
// (coe_manager/system_admin), se o pedido continuar por decidir — ver
// /api/admin/sla-alerts/run.
export const REQUEST_SLA_ESCALATION_DELAY_HOURS = 24;

export function shouldEscalateRequest(slaAlertedAt: Date | string | null, decidedAt: Date | string | null, now: Date = new Date()): boolean {
  if (slaAlertedAt == null || decidedAt != null) return false;
  const hoursSinceAlert = (now.getTime() - new Date(slaAlertedAt).getTime()) / (60 * 60 * 1000);
  return hoursSinceAlert >= REQUEST_SLA_ESCALATION_DELAY_HOURS;
}

export type MonthlyTrendBucket = { label: string; count: number; slaPct: number };

// Agrupa por mês de criação (createdAt) os últimos `monthsBack` meses,
// incluindo o mês corrente. Meses sem pedidos aparecem com count 0 e
// slaPct 0 — nunca inventados, ao contrário do array fixo que isto
// substitui.
export function bucketRequestsByMonth(items: RequestSlaRow[], monthsBack = 6, now: Date = new Date()): MonthlyTrendBucket[] {
  const formatter = new Intl.DateTimeFormat("pt-PT", { month: "short" });
  const buckets: MonthlyTrendBucket[] = [];

  for (let offset = monthsBack - 1; offset >= 0; offset--) {
    const bucketDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const bucketYear = bucketDate.getFullYear();
    const bucketMonth = bucketDate.getMonth();
    const label = formatter.format(bucketDate).replace(/\.$/, "").replace(/^\w/, (c) => c.toUpperCase());

    const monthItems = items.filter((item) => {
      const created = new Date(item.createdAt);
      return created.getFullYear() === bucketYear && created.getMonth() === bucketMonth;
    });

    buckets.push({ label, count: monthItems.length, slaPct: computeSlaOnTimePct(monthItems, now) });
  }

  return buckets;
}
