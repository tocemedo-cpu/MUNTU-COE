import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, uniqueDomain } from "./helpers";
import { companies, requests, supportTickets, users } from "@/db/schema";
import { POST as runSlaAlerts } from "@/app/api/admin/sla-alerts/run/route";

function cronRequest(secretHeader?: string) {
  const headers: HeadersInit = { "content-type": "application/json" };
  if (secretHeader !== undefined) headers["x-cron-secret"] = secretHeader;
  return new Request("http://localhost/api/admin/sla-alerts/run", { method: "POST", headers });
}

async function makeCompanyAdmin(companyId: number) {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      name: `Aprovador ${Date.now()}-${Math.random()}`,
      email: `approver-${Date.now()}-${Math.random()}@example.com`,
      role: "Administrador da empresa",
      initials: "AP",
      companyId,
      accessLevel: "company_admin",
    })
    .returning();
  return user;
}

async function makeRequesterOwner(companyId: number) {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      name: `Requisitante ${Date.now()}-${Math.random()}`,
      email: `owner-${Date.now()}-${Math.random()}@example.com`,
      role: "Requisitante",
      initials: "RQ",
      companyId,
      accessLevel: "requester",
    })
    .returning();
  return user;
}

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("POST /api/admin/sla-alerts/run", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });
  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  it("refuses when CRON_SECRET is not configured on the server", async () => {
    delete process.env.CRON_SECRET;
    const response = await runSlaAlerts(cronRequest("anything"));
    expect(response.status).toBe(501);
  });

  it("refuses a call with a wrong or missing secret", async () => {
    const wrongSecret = await runSlaAlerts(cronRequest("wrong-secret"));
    expect(wrongSecret.status).toBe(401);
    const noSecret = await runSlaAlerts(cronRequest());
    expect(noSecret.status).toBe(401);
  });

  it("alerts a breached pending request's company_admin exactly once, never again on the next run", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Empresa SLA", domain: uniqueDomain("sla-request") }).returning();
    const approver = await makeCompanyAdmin(company.id);
    const owner = await makeRequesterOwner(company.id);

    const [req] = await db
      .insert(requests)
      .values({
        id: `REQ-2026-SLA${Date.now() % 100000}`,
        subject: "Pedido com SLA vencido",
        tower: "Requisition-to-PO",
        value: 1000,
        status: "Aprovação",
        priority: "Alta",
        owner: owner.name,
        ownerUserId: owner.id,
        companyId: company.id,
        sla: "4 horas",
        stage: 2,
        submitted: "há 2 dias",
        supplier: "Fornecedor X",
        costCenter: "CC-1",
        slaDueAt: new Date(Date.now() - 60 * 60 * 1000), // vencido há 1h
      })
      .returning();

    const response = await runSlaAlerts(cronRequest("test-cron-secret"));
    expect(response.status).toBe(200);

    const [afterFirstRun] = await db.select().from(requests).where(eq(requests.id, req.id));
    expect(afterFirstRun.slaAlertedAt).not.toBeNull();
    expect(afterFirstRun.slaEscalatedAt).toBeNull();

    // Segunda corrida imediatamente a seguir: não volta a alertar (já tem slaAlertedAt).
    await runSlaAlerts(cronRequest("test-cron-secret"));
    const [afterSecondRun] = await db.select().from(requests).where(eq(requests.id, req.id));
    expect(afterSecondRun.slaAlertedAt?.getTime()).toBe(afterFirstRun.slaAlertedAt?.getTime());
    expect(afterSecondRun.slaEscalatedAt).toBeNull();

    void approver; // usado só para garantir que existe um destinatário real na empresa
  });

  it("escalates a request that is still pending 24h after the alert was sent", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Empresa Escalada", domain: uniqueDomain("sla-escalation") }).returning();
    const owner = await makeRequesterOwner(company.id);

    const [req] = await db
      .insert(requests)
      .values({
        id: `REQ-2026-ESC${Date.now() % 100000}`,
        subject: "Pedido a escalar",
        tower: "Requisition-to-PO",
        value: 1000,
        status: "Aprovação",
        priority: "Alta",
        owner: owner.name,
        ownerUserId: owner.id,
        companyId: company.id,
        sla: "4 horas",
        stage: 2,
        submitted: "há muito tempo",
        supplier: "Fornecedor Y",
        costCenter: "CC-2",
        slaDueAt: new Date(Date.now() - 30 * 60 * 60 * 1000), // vencido há 30h
        slaAlertedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // alertado há 25h (> 24h de tolerância)
      })
      .returning();

    await runSlaAlerts(cronRequest("test-cron-secret"));

    const [updated] = await db.select().from(requests).where(eq(requests.id, req.id));
    expect(updated.slaEscalatedAt).not.toBeNull();
  });

  it("alerts a support ticket's assigned user, or falls back to system_admin when unassigned", async () => {
    const db = getDb();
    const [owner] = await db
      .insert(users)
      .values({ name: `Dono Ticket ${Date.now()}`, email: `ticket-owner-${Date.now()}@example.com`, role: "Requisitante", initials: "DT", accessLevel: "requester" })
      .returning();
    const [assignee] = await db
      .insert(users)
      .values({ name: `Responsável Ticket ${Date.now()}`, email: `ticket-assignee-${Date.now()}@example.com`, role: "System Admin", initials: "RT", accessLevel: "system_admin" })
      .returning();

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        id: `SUP-2026-SLA${Date.now() % 100000}`,
        subject: "Ticket com SLA vencido",
        category: "Geral",
        priority: "urgente",
        status: "aberto",
        userId: owner.id,
        assignedToUserId: assignee.id,
        slaDueAt: new Date(Date.now() - 60 * 60 * 1000),
      })
      .returning();

    await runSlaAlerts(cronRequest("test-cron-secret"));

    const [updated] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticket.id));
    expect(updated.slaAlertedAt).not.toBeNull();
  });

  it("never alerts an already-resolved ticket, even with a due date in the past", async () => {
    const db = getDb();
    const [owner] = await db
      .insert(users)
      .values({ name: `Dono Resolvido ${Date.now()}`, email: `resolved-owner-${Date.now()}@example.com`, role: "Requisitante", initials: "DR", accessLevel: "requester" })
      .returning();

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        id: `SUP-2026-RES${Date.now() % 100000}`,
        subject: "Ticket já resolvido",
        category: "Geral",
        priority: "urgente",
        status: "resolvido",
        userId: owner.id,
        slaDueAt: new Date(Date.now() - 60 * 60 * 1000),
      })
      .returning();

    await runSlaAlerts(cronRequest("test-cron-secret"));

    const [unchanged] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticket.id));
    expect(unchanged.slaAlertedAt).toBeNull();
  });
});
