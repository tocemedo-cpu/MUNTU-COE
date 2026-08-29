import { eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { requests, supportTickets, users } from "@/db/schema";
import { sendSlaAlertEmail, sendSlaEscalationEmail } from "@/lib/mailer";
import { isRequestSlaBreached, shouldEscalateRequest } from "@/lib/requests-sla";
import type { SupportStatus } from "@/lib/support";
import { isSlaBreached, shouldEscalateTicket } from "@/lib/support";

/**
 * Alertas de SLA vencido + escalonamento — pensada para ser chamada
 * periodicamente por um agendador externo (mesmo padrão de
 * /api/admin/billing/generate-monthly): isenta do middleware de sessão,
 * autenticada só pelo próprio CRON_SECRET. Sem CRON_SECRET definido,
 * recusa sempre — nunca corre "aberta".
 *
 * Cada pedido/ticket com o SLA vencido recebe um alerta uma única vez
 * (sla_alerted_at) e, se continuar por decidir/resolver passado
 * REQUEST_SLA_ESCALATION_DELAY_HOURS/SUPPORT_SLA_ESCALATION_DELAY_HOURS
 * depois do alerta, é escalonado uma única vez (sla_escalated_at) para a
 * liderança Muntu (coe_manager/system_admin). As duas colunas só
 * existem para nunca reenviar o mesmo e-mail em cada corrida — nunca são
 * lidas como estado de negócio fora desta rota.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET não está configurado no servidor." }, { status: 501 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const portalUrl = `${origin}/`;
  const db = getDb();
  const now = new Date();

  const summary = { requestsAlerted: 0, requestsEscalated: 0, ticketsAlerted: 0, ticketsEscalated: 0 };

  const pendingRequests = await db.select().from(requests).where(isNull(requests.decidedAt));
  for (const item of pendingRequests) {
    if (!isRequestSlaBreached(item.slaDueAt, item.decidedAt, now)) continue;

    if (item.slaAlertedAt == null) {
      const recipients = item.companyId != null
        ? await db.select().from(users).where(eq(users.companyId, item.companyId))
        : [];
      const approvers = recipients.filter((user) => user.accessLevel === "company_admin");
      const targets = approvers.length ? approvers : await db.select().from(users).where(eq(users.accessLevel, "system_admin"));
      for (const target of targets) {
        await sendSlaAlertEmail(target.email, { label: "O pedido", entityId: item.id, portalUrl });
      }
      await db.update(requests).set({ slaAlertedAt: now }).where(eq(requests.id, item.id));
      summary.requestsAlerted += 1;
    } else if (shouldEscalateRequest(item.slaAlertedAt, item.decidedAt, now)) {
      const leadership = await db.select().from(users).where(inArray(users.accessLevel, ["coe_manager", "system_admin"]));
      for (const target of leadership) {
        await sendSlaEscalationEmail(target.email, { label: "O pedido", entityId: item.id, portalUrl });
      }
      await db.update(requests).set({ slaEscalatedAt: now }).where(eq(requests.id, item.id));
      summary.requestsEscalated += 1;
    }
  }

  const openTickets = await db.select().from(supportTickets).where(inArray(supportTickets.status, ["aberto", "em_curso"]));
  for (const ticket of openTickets) {
    if (!isSlaBreached(ticket.slaDueAt, ticket.status as SupportStatus, now)) continue;

    if (ticket.slaAlertedAt == null) {
      const targets = ticket.assignedToUserId != null
        ? await db.select().from(users).where(eq(users.id, ticket.assignedToUserId))
        : await db.select().from(users).where(eq(users.accessLevel, "system_admin"));
      for (const target of targets) {
        await sendSlaAlertEmail(target.email, { label: "O pedido de suporte", entityId: ticket.id, portalUrl });
      }
      await db.update(supportTickets).set({ slaAlertedAt: now }).where(eq(supportTickets.id, ticket.id));
      summary.ticketsAlerted += 1;
    } else if (shouldEscalateTicket(ticket.slaAlertedAt, ticket.status as SupportStatus, now)) {
      const admins = await db.select().from(users).where(eq(users.accessLevel, "system_admin"));
      for (const target of admins) {
        await sendSlaEscalationEmail(target.email, { label: "O pedido de suporte", entityId: ticket.id, portalUrl });
      }
      await db.update(supportTickets).set({ slaEscalatedAt: now }).where(eq(supportTickets.id, ticket.id));
      summary.ticketsEscalated += 1;
    }
  }

  return Response.json(summary);
}
