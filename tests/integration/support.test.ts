import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { seedIfEmpty } from "@/db/seed-data";
import { companies, supportMessages, supportTickets, users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { GET as listTickets, POST as createTicket } from "@/app/api/support/route";
import { GET as getTicket, PATCH as patchTicket } from "@/app/api/support/[id]/route";
import { POST as postMessage } from "@/app/api/support/[id]/messages/route";

async function makeUser(accessLevel: "requester" | "supplier" | "system_admin", label: string) {
  const db = getDb();
  const [company] = await db.insert(companies).values({ name: `Cliente ${label}`, domain: uniqueDomain(`support-${label}`) }).returning();
  const [user] = await db
    .insert(users)
    .values({
      name: `Utilizador ${label}`,
      email: `support-${label}-${company.id}@example.com`,
      password: await hashPassword("Password123!"),
      role: "Requisitante",
      initials: "UT",
      companyId: accessLevel === "requester" ? company.id : null,
      accessLevel,
    })
    .returning();
  return { user, company };
}

describe("Support ticket inbox", () => {
  beforeAll(async () => {
    await seedIfEmpty(getDb());
  });

  it("creates a ticket with a first message and a computed SLA due date", async () => {
    const { user } = await makeUser("requester", "create");

    const response = await createTicket(
      jsonRequest("http://localhost/api/support", {
        method: "POST",
        session: { userId: user.id, accessLevel: "requester", companyId: user.companyId },
        body: { subject: "Não consigo aceder aos meus pedidos", category: "Conta e acesso", priority: "alta", message: "Aparece um erro 403 sempre que tento abrir." },
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.ticket.id).toMatch(/^SUP-\d{4}-\d{4}$/);
    expect(body.ticket.status).toBe("aberto");
    expect(body.ticket.category).toBe("Conta e acesso");
    expect(body.ticket.priority).toBe("alta");

    const created = new Date(body.ticket.createdAt).getTime();
    const due = new Date(body.ticket.slaDueAt).getTime();
    expect(due - created).toBeCloseTo(24 * 60 * 60 * 1000, -3); // "alta" = 24h

    const db = getDb();
    const messages = await db.select().from(supportMessages).where(eq(supportMessages.ticketId, body.ticket.id));
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toContain("erro 403");
  });

  it("defaults to category Geral and priority normal when omitted", async () => {
    const { user } = await makeUser("requester", "defaults");
    const response = await createTicket(
      jsonRequest("http://localhost/api/support", {
        method: "POST",
        session: { userId: user.id, accessLevel: "requester", companyId: user.companyId },
        body: { subject: "Dúvida geral", message: "Só uma pergunta." },
      })
    );
    const body = await response.json();
    expect(body.ticket.category).toBe("Geral");
    expect(body.ticket.priority).toBe("normal");
  });

  it("a regular user only sees their own tickets in the list", async () => {
    const { user: userA } = await makeUser("requester", "listA");
    const { user: userB } = await makeUser("requester", "listB");

    await createTicket(
      jsonRequest("http://localhost/api/support", {
        method: "POST",
        session: { userId: userA.id, accessLevel: "requester", companyId: userA.companyId },
        body: { subject: "Pedido do utilizador A", message: "Mensagem A" },
      })
    );
    await createTicket(
      jsonRequest("http://localhost/api/support", {
        method: "POST",
        session: { userId: userB.id, accessLevel: "requester", companyId: userB.companyId },
        body: { subject: "Pedido do utilizador B", message: "Mensagem B" },
      })
    );

    const responseA = await listTickets(jsonRequest("http://localhost/api/support", { method: "GET", session: { userId: userA.id, accessLevel: "requester" } }));
    const bodyA = await responseA.json();
    expect(bodyA.tickets.every((t: { userId: number }) => t.userId === userA.id)).toBe(true);
    expect(bodyA.tickets.some((t: { subject: string }) => t.subject === "Pedido do utilizador B")).toBe(false);
  });

  it("system_admin sees every ticket in the list, including other users'", async () => {
    const { user } = await makeUser("requester", "adminview");
    await createTicket(
      jsonRequest("http://localhost/api/support", {
        method: "POST",
        session: { userId: user.id, accessLevel: "requester", companyId: user.companyId },
        body: { subject: "Visível para o admin", message: "Mensagem" },
      })
    );

    const response = await listTickets(jsonRequest("http://localhost/api/support", { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }));
    const body = await response.json();
    expect(body.tickets.some((t: { subject: string }) => t.subject === "Visível para o admin")).toBe(true);
  });

  it("owner can read their own ticket with its message thread; a different user gets 403", async () => {
    const { user: owner } = await makeUser("requester", "detailOwner");
    const { user: stranger } = await makeUser("requester", "detailStranger");

    const created = await (
      await createTicket(
        jsonRequest("http://localhost/api/support", {
          method: "POST",
          session: { userId: owner.id, accessLevel: "requester", companyId: owner.companyId },
          body: { subject: "Detalhe do pedido", message: "Primeira mensagem" },
        })
      )
    ).json();
    const ticketId = created.ticket.id;

    const ownerView = await getTicket(jsonRequest(`http://localhost/api/support/${ticketId}`, { method: "GET", session: { userId: owner.id, accessLevel: "requester" } }), {
      params: Promise.resolve({ id: ticketId }),
    });
    expect(ownerView.status).toBe(200);
    const ownerBody = await ownerView.json();
    expect(ownerBody.messages).toHaveLength(1);
    expect(ownerBody.messages[0].body).toBe("Primeira mensagem");

    const strangerView = await getTicket(
      jsonRequest(`http://localhost/api/support/${ticketId}`, { method: "GET", session: { userId: stranger.id, accessLevel: "requester" } }),
      { params: Promise.resolve({ id: ticketId }) }
    );
    expect(strangerView.status).toBe(403);
  });

  it("a supplier user (not just requester) can open and read their own ticket too — any accessLevel is allowed", async () => {
    const { user } = await makeUser("supplier", "supplierTicket");
    const created = await (
      await createTicket(
        jsonRequest("http://localhost/api/support", {
          method: "POST",
          session: { userId: user.id, accessLevel: "supplier" },
          body: { subject: "Pergunta de fornecedor", message: "Como actualizo o meu perfil?" },
        })
      )
    ).json();
    expect(created.ticket).toBeTruthy();

    const view = await getTicket(
      jsonRequest(`http://localhost/api/support/${created.ticket.id}`, { method: "GET", session: { userId: user.id, accessLevel: "supplier" } }),
      { params: Promise.resolve({ id: created.ticket.id }) }
    );
    expect(view.status).toBe(200);
  });

  it("system_admin can reply, which auto-moves status from aberto to em_curso", async () => {
    const { user } = await makeUser("requester", "reply");
    const created = await (
      await createTicket(
        jsonRequest("http://localhost/api/support", {
          method: "POST",
          session: { userId: user.id, accessLevel: "requester", companyId: user.companyId },
          body: { subject: "Preciso de ajuda", message: "Mensagem inicial" },
        })
      )
    ).json();
    expect(created.ticket.status).toBe("aberto");

    const replyResponse = await postMessage(
      jsonRequest(`http://localhost/api/support/${created.ticket.id}/messages`, {
        method: "POST",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { body: "Já estamos a ver isto." },
      }),
      { params: Promise.resolve({ id: created.ticket.id }) }
    );
    expect(replyResponse.status).toBe(201);

    const db = getDb();
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, created.ticket.id));
    expect(ticket.status).toBe("em_curso");

    const messages = await db.select().from(supportMessages).where(eq(supportMessages.ticketId, created.ticket.id));
    expect(messages).toHaveLength(2);
  });

  it("a non-owner, non-admin user cannot post a message on someone else's ticket", async () => {
    const { user: owner } = await makeUser("requester", "protectOwner");
    const { user: stranger } = await makeUser("requester", "protectStranger");
    const created = await (
      await createTicket(
        jsonRequest("http://localhost/api/support", {
          method: "POST",
          session: { userId: owner.id, accessLevel: "requester", companyId: owner.companyId },
          body: { subject: "Privado", message: "Mensagem" },
        })
      )
    ).json();

    const response = await postMessage(
      jsonRequest(`http://localhost/api/support/${created.ticket.id}/messages`, {
        method: "POST",
        session: { userId: stranger.id, accessLevel: "requester" },
        body: { body: "Tentativa de intrusão" },
      }),
      { params: Promise.resolve({ id: created.ticket.id }) }
    );
    expect(response.status).toBe(403);
  });

  it("only system_admin can PATCH a ticket's status/priority/category/assignee", async () => {
    const { user } = await makeUser("requester", "patch");
    const created = await (
      await createTicket(
        jsonRequest("http://localhost/api/support", {
          method: "POST",
          session: { userId: user.id, accessLevel: "requester", companyId: user.companyId },
          body: { subject: "A resolver", priority: "baixa", message: "Mensagem" },
        })
      )
    ).json();

    const deniedResponse = await patchTicket(
      jsonRequest(`http://localhost/api/support/${created.ticket.id}`, {
        method: "PATCH",
        session: { userId: user.id, accessLevel: "requester" },
        body: { status: "resolvido" },
      }),
      { params: Promise.resolve({ id: created.ticket.id }) }
    );
    expect(deniedResponse.status).toBe(403);

    const adminResponse = await patchTicket(
      jsonRequest(`http://localhost/api/support/${created.ticket.id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "system_admin" },
        body: { status: "resolvido", priority: "urgente", category: "Facturação", assignedToUserId: 1 },
      }),
      { params: Promise.resolve({ id: created.ticket.id }) }
    );
    expect(adminResponse.status).toBe(200);
    const body = await adminResponse.json();
    expect(body.ticket.status).toBe("resolvido");
    expect(body.ticket.priority).toBe("urgente");
    expect(body.ticket.category).toBe("Facturação");
    expect(body.ticket.assignedToUserId).toBe(1);
    expect(body.ticket.resolvedAt).toBeTruthy();
  });

  it("404s for an unknown ticket id on GET, PATCH and the messages route", async () => {
    const getResponse = await getTicket(jsonRequest("http://localhost/api/support/SUP-2026-9999", { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }), {
      params: Promise.resolve({ id: "SUP-2026-9999" }),
    });
    expect(getResponse.status).toBe(404);

    const patchResponse = await patchTicket(
      jsonRequest("http://localhost/api/support/SUP-2026-9999", { method: "PATCH", session: { userId: 1, accessLevel: "system_admin" }, body: { status: "resolvido" } }),
      { params: Promise.resolve({ id: "SUP-2026-9999" }) }
    );
    expect(patchResponse.status).toBe(404);

    const messageResponse = await postMessage(
      jsonRequest("http://localhost/api/support/SUP-2026-9999/messages", { method: "POST", session: { userId: 1, accessLevel: "system_admin" }, body: { body: "x" } }),
      { params: Promise.resolve({ id: "SUP-2026-9999" }) }
    );
    expect(messageResponse.status).toBe(404);
  });
});
