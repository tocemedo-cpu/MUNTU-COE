import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, suppliers, users } from "@/db/schema";
import { GET as listApplications, POST as createApplication } from "@/app/api/applications/route";
import { GET as getApplication, PATCH as reviewApplication } from "@/app/api/applications/[id]/route";
import { POST as uploadApplicationDocument } from "@/app/api/applications/[id]/documents/route";
import { GET as downloadApplicationDocument } from "@/app/api/applications/[id]/documents/[documentId]/download/route";
import { POST as homologateApplication } from "@/app/api/applications/[id]/homologate/route";

function requestWithForm(url: string, form: FormData) {
  return new Request(url, { method: "POST", body: form });
}

// applications.reviewed_by_user_id tem uma FK real para users.id — ao
// contrário de um 403 (rejeitado antes de qualquer escrita), uma acção de
// revisão bem-sucedida grava mesmo este id, por isso precisa de apontar
// para uma linha real (mesma classe de bug já corrigida em
// document-access.test.ts com fake ids 42/777).
async function makeReviewer(accessLevel: "coe_manager" | "system_admin" = "coe_manager") {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      name: `Revisor ${Date.now()}-${Math.random()}`,
      email: `reviewer-${Date.now()}-${Math.random()}@example.com`,
      role: accessLevel === "system_admin" ? "System Admin" : "COE Manager",
      initials: "RV",
      accessLevel,
    })
    .returning();
  return user;
}

async function submitApplication(kind: "empresa" | "fornecedor", overrides: Partial<Record<string, string>> = {}) {
  // O domínio do e-mail vira o domínio da empresa criada na homologação
  // (companies.domain é único) — precisa de ser único por candidatura, não
  // só o endereço completo, para vários testes/execuções não colidirem.
  const email = overrides.contactEmail ?? `candidato@${uniqueDomain("app-submit")}`;
  const request = jsonRequest("http://localhost/api/applications", {
    method: "POST",
    body: {
      kind,
      companyName: overrides.companyName ?? "Nova Operadora Teste",
      taxId: overrides.taxId ?? "5417123456",
      sector: overrides.sector ?? "Logística",
      contactName: overrides.contactName ?? "Cliente Candidato",
      contactEmail: email,
      contactPhone: overrides.contactPhone ?? "+244 900 000 000",
      notes: overrides.notes ?? "Queremos aderir ao Muntu COE.",
    },
  });
  // IP distinto por candidatura simulada — este ficheiro submete muito
  // mais candidaturas do que um utilizador real submeteria numa hora, e
  // todas partilhariam o mesmo "sem x-forwarded-for" sem isto, tropeçando
  // no limite de pedidos por IP (ver lib/rate-limit.ts) que existe mesmo
  // para proteger contra spam real do formulário público.
  request.headers.set("x-forwarded-for", `203.0.113.${1 + Math.floor(Math.random() * 254)}`);
  const response = await createApplication(request);
  expect(response.status).toBe(201);
  const body = await response.json();
  return { body, email };
}

describe("POST /api/applications (public submission)", () => {
  it("creates an application with no session at all and returns an access token", async () => {
    const { body } = await submitApplication("empresa");
    expect(body.application.id).toMatch(/^CAND-2026-\d{4}$/);
    expect(body.application.status).toBe("recebida");
    expect(typeof body.token).toBe("string");
  });

  it("rejects a payload missing required fields", async () => {
    const response = await createApplication(
      jsonRequest("http://localhost/api/applications", { method: "POST", body: { kind: "empresa" } })
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/applications (internal listing)", () => {
  it("is forbidden without a reviewer session, allowed for coe_manager", async () => {
    await submitApplication("empresa");
    const reviewerUser = await makeReviewer("coe_manager");

    const anon = await listApplications(new Request("http://localhost/api/applications"));
    expect(anon.status).toBe(403);

    const requester = await listApplications(
      jsonRequest("http://localhost/api/applications", { method: "GET", session: { userId: 1, accessLevel: "requester" } })
    );
    expect(requester.status).toBe(403);

    const reviewer = await listApplications(
      jsonRequest("http://localhost/api/applications", { method: "GET", session: { userId: reviewerUser.id, accessLevel: "coe_manager" } })
    );
    expect(reviewer.status).toBe(200);
    const body = await reviewer.json();
    expect(Array.isArray(body.applications)).toBe(true);
  });
});

describe("GET /api/applications/:id (mixed access)", () => {
  it("lets the applicant see their own application by token, but not by a wrong/missing token", async () => {
    const { body } = await submitApplication("fornecedor");
    const id = body.application.id;

    const withToken = await getApplication(new Request(`http://localhost/api/applications/${id}?token=${body.token}`), {
      params: Promise.resolve({ id }),
    });
    expect(withToken.status).toBe(200);

    const noToken = await getApplication(new Request(`http://localhost/api/applications/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(noToken.status).toBe(403);

    const wrongToken = await getApplication(new Request(`http://localhost/api/applications/${id}?token=not-a-real-token`), {
      params: Promise.resolve({ id }),
    });
    expect(wrongToken.status).toBe(403);
  });

  it("lets a reviewer see any application without a token", async () => {
    const { body } = await submitApplication("empresa");
    const id = body.application.id;
    const response = await getApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }),
      { params: Promise.resolve({ id }) }
    );
    expect(response.status).toBe(200);
  });
});

describe("PATCH /api/applications/:id (review transitions)", () => {
  it("moves recebida -> em_avaliacao -> aprovada, forbidden for non-reviewers, rejects without a reason", async () => {
    const { body } = await submitApplication("empresa");
    const id = body.application.id;
    const reviewer = await makeReviewer("coe_manager");

    const forbidden = await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, { method: "PATCH", session: { userId: 1, accessLevel: "requester" }, body: { status: "em_avaliacao" } }),
      { params: Promise.resolve({ id }) }
    );
    expect(forbidden.status).toBe(403);

    const toReview = await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, { method: "PATCH", session: { userId: reviewer.id, accessLevel: "coe_manager" }, body: { status: "em_avaliacao" } }),
      { params: Promise.resolve({ id }) }
    );
    expect(toReview.status).toBe(200);
    expect((await toReview.json()).application.status).toBe("em_avaliacao");

    const missingReason = await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, { method: "PATCH", session: { userId: reviewer.id, accessLevel: "coe_manager" }, body: { status: "rejeitada" } }),
      { params: Promise.resolve({ id }) }
    );
    expect(missingReason.status).toBe(400);

    const approved = await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, { method: "PATCH", session: { userId: reviewer.id, accessLevel: "coe_manager" }, body: { status: "aprovada" } }),
      { params: Promise.resolve({ id }) }
    );
    expect(approved.status).toBe(200);
    expect((await approved.json()).application.status).toBe("aprovada");
  });
});

describe("POST /api/applications/:id/documents (token-gated applicant upload)", () => {
  it("accepts an upload with the right token, rejects a wrong one", async () => {
    const { body } = await submitApplication("empresa");
    const id = body.application.id;

    const file = new File(["conteudo real de evidencia"], "certidao.pdf", { type: "application/pdf" });
    const goodForm = new FormData();
    goodForm.append("token", body.token);
    goodForm.append("file", file);
    const ok = await uploadApplicationDocument(requestWithForm(`http://localhost/api/applications/${id}/documents`, goodForm), {
      params: Promise.resolve({ id }),
    });
    expect(ok.status).toBe(201);

    const badForm = new FormData();
    badForm.append("token", "not-a-real-token");
    badForm.append("file", file);
    const forbidden = await uploadApplicationDocument(requestWithForm(`http://localhost/api/applications/${id}/documents`, badForm), {
      params: Promise.resolve({ id }),
    });
    expect(forbidden.status).toBe(403);
  });
});

describe("GET /api/applications/:id/documents/:documentId/download", () => {
  it("lets the applicant download their own uploaded document with the right token", async () => {
    const { body } = await submitApplication("empresa");
    const id = body.application.id;
    const content = "conteudo real do documento de candidatura";
    const file = new File([content], "certidao.pdf", { type: "application/pdf" });
    const form = new FormData();
    form.append("token", body.token);
    form.append("file", file);
    const uploaded = await uploadApplicationDocument(requestWithForm(`http://localhost/api/applications/${id}/documents`, form), {
      params: Promise.resolve({ id }),
    });
    const uploadedBody = await uploaded.json();
    const documentId = String(uploadedBody.document.id);

    const ok = await downloadApplicationDocument(
      new Request(`http://localhost/api/applications/${id}/documents/${documentId}/download?token=${body.token}`),
      { params: Promise.resolve({ id, documentId }) }
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe(content);

    const wrongToken = await downloadApplicationDocument(
      new Request(`http://localhost/api/applications/${id}/documents/${documentId}/download?token=not-a-real-token`),
      { params: Promise.resolve({ id, documentId }) }
    );
    expect(wrongToken.status).toBe(403);
  });

  it("lets a reviewer download without a token, and 404s a documentId from a different application", async () => {
    const { body: appA } = await submitApplication("empresa");
    const { body: appB } = await submitApplication("fornecedor");
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const formA = new FormData();
    formA.append("token", appA.token);
    formA.append("file", file);
    const uploadedA = await uploadApplicationDocument(
      requestWithForm(`http://localhost/api/applications/${appA.application.id}/documents`, formA),
      { params: Promise.resolve({ id: appA.application.id }) }
    );
    const documentId = String((await uploadedA.json()).document.id);

    const reviewer = await downloadApplicationDocument(
      jsonRequest(`http://localhost/api/applications/${appA.application.id}/documents/${documentId}/download`, {
        method: "GET",
        session: { userId: 1, accessLevel: "system_admin" },
      }),
      { params: Promise.resolve({ id: appA.application.id, documentId }) }
    );
    expect(reviewer.status).toBe(200);

    const wrongApplication = await downloadApplicationDocument(
      new Request(`http://localhost/api/applications/${appB.application.id}/documents/${documentId}/download?token=${appB.token}`),
      { params: Promise.resolve({ id: appB.application.id, documentId }) }
    );
    expect(wrongApplication.status).toBe(404);
  });
});

describe("PATCH /api/applications/:id (assignment)", () => {
  it("assigns to a real coe_manager/system_admin, then unassigns", async () => {
    const { body } = await submitApplication("empresa");
    const id = body.application.id;
    const actor = await makeReviewer("coe_manager");
    const assignee = await makeReviewer("system_admin");

    const assigned = await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, {
        method: "PATCH",
        session: { userId: actor.id, accessLevel: "coe_manager" },
        body: { assignedToUserId: assignee.id },
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(assigned.status).toBe(200);
    expect((await assigned.json()).application.assignedToUserId).toBe(assignee.id);

    const unassigned = await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, {
        method: "PATCH",
        session: { userId: actor.id, accessLevel: "coe_manager" },
        body: { assignedToUserId: null },
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(unassigned.status).toBe(200);
    expect((await unassigned.json()).application.assignedToUserId).toBeNull();
  });

  it("refuses to assign to a non-reviewer, and 403s a non-reviewer session", async () => {
    const { body } = await submitApplication("empresa");
    const id = body.application.id;
    const actor = await makeReviewer("coe_manager");
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Empresa Assign", domain: uniqueDomain("assign") }).returning();
    const [requesterUser] = await db
      .insert(users)
      .values({ name: "Requisitante", email: `assign-requester-${Date.now()}-${Math.random()}@example.com`, role: "Requisitante", initials: "RQ", companyId: company.id, accessLevel: "requester" })
      .returning();

    const badAssignee = await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, {
        method: "PATCH",
        session: { userId: actor.id, accessLevel: "coe_manager" },
        body: { assignedToUserId: requesterUser.id },
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(badAssignee.status).toBe(400);

    const forbidden = await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, {
        method: "PATCH",
        session: { userId: 1, accessLevel: "requester" },
        body: { assignedToUserId: actor.id },
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(forbidden.status).toBe(403);
  });
});

describe("POST /api/applications/:id/homologate", () => {
  it("only homologates an approved application, and creates a real company + company_admin user", async () => {
    const { body, email } = await submitApplication("empresa", { companyName: `Homolog Co ${Date.now()}` });
    const id = body.application.id;
    const reviewer = await makeReviewer("coe_manager");

    const tooEarly = await homologateApplication(
      jsonRequest(`http://localhost/api/applications/${id}/homologate`, { method: "POST", session: { userId: reviewer.id, accessLevel: "coe_manager" } }),
      { params: Promise.resolve({ id }) }
    );
    expect(tooEarly.status).toBe(400);

    await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, { method: "PATCH", session: { userId: reviewer.id, accessLevel: "coe_manager" }, body: { status: "em_avaliacao" } }),
      { params: Promise.resolve({ id }) }
    );
    await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, { method: "PATCH", session: { userId: reviewer.id, accessLevel: "coe_manager" }, body: { status: "aprovada" } }),
      { params: Promise.resolve({ id }) }
    );

    const homologated = await homologateApplication(
      jsonRequest(`http://localhost/api/applications/${id}/homologate`, { method: "POST", session: { userId: reviewer.id, accessLevel: "coe_manager" } }),
      { params: Promise.resolve({ id }) }
    );
    expect(homologated.status).toBe(200);
    const homologatedBody = await homologated.json();
    expect(homologatedBody.application.status).toBe("homologada");
    expect(homologatedBody.application.createdCompanyId).toBeTruthy();
    expect(homologatedBody.application.createdUserId).toBeTruthy();

    const db = getDb();
    const [newUser] = await db.select().from(users).where(eq(users.email, email));
    expect(newUser.accessLevel).toBe("company_admin");
    expect(newUser.password).toBeNull();
    const [newCompany] = await db.select().from(companies).where(eq(companies.id, newUser.companyId!));
    expect(newCompany.name).toBe(homologatedBody.application.companyName);
    // NIF copiado da candidatura — alimenta a exportação AGT/SAF-T
    // (lib/saft.ts) sem precisar de ser preenchido à mão depois.
    expect(newCompany.taxId).toBe("5417123456");

    // Idempotency: cannot homologate the same application twice.
    const again = await homologateApplication(
      jsonRequest(`http://localhost/api/applications/${id}/homologate`, { method: "POST", session: { userId: reviewer.id, accessLevel: "coe_manager" } }),
      { params: Promise.resolve({ id }) }
    );
    expect(again.status).toBe(400);
  });

  it("creates a real supplier + supplier user for a fornecedor application", async () => {
    const { body, email } = await submitApplication("fornecedor", { companyName: `Homolog Fornecedor ${Date.now()}` });
    const id = body.application.id;
    const reviewer = await makeReviewer("system_admin");
    await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, { method: "PATCH", session: { userId: reviewer.id, accessLevel: "system_admin" }, body: { status: "em_avaliacao" } }),
      { params: Promise.resolve({ id }) }
    );
    await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, { method: "PATCH", session: { userId: reviewer.id, accessLevel: "system_admin" }, body: { status: "aprovada" } }),
      { params: Promise.resolve({ id }) }
    );
    const homologated = await homologateApplication(
      jsonRequest(`http://localhost/api/applications/${id}/homologate`, { method: "POST", session: { userId: reviewer.id, accessLevel: "system_admin" } }),
      { params: Promise.resolve({ id }) }
    );
    expect(homologated.status).toBe(200);

    const db = getDb();
    const [newUser] = await db.select().from(users).where(eq(users.email, email));
    expect(newUser.accessLevel).toBe("supplier");
    const [newSupplier] = await db.select().from(suppliers).where(eq(suppliers.id, newUser.supplierId!));
    expect(newSupplier).toBeTruthy();
  });

  it("refuses to homologate when a user with that e-mail already exists", async () => {
    const db = getDb();
    const clashEmail = `clash-${Date.now()}@example.com`;
    const [company] = await db.insert(companies).values({ name: "Empresa Existente", domain: uniqueDomain("app-clash") }).returning();
    await db.insert(users).values({ name: "Já Existe", email: clashEmail, role: "Requisitante", initials: "JE", companyId: company.id, accessLevel: "requester" });
    const reviewer = await makeReviewer("coe_manager");

    const { body } = await submitApplication("empresa", { contactEmail: clashEmail });
    const id = body.application.id;
    await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, { method: "PATCH", session: { userId: reviewer.id, accessLevel: "coe_manager" }, body: { status: "em_avaliacao" } }),
      { params: Promise.resolve({ id }) }
    );
    await reviewApplication(
      jsonRequest(`http://localhost/api/applications/${id}`, { method: "PATCH", session: { userId: reviewer.id, accessLevel: "coe_manager" }, body: { status: "aprovada" } }),
      { params: Promise.resolve({ id }) }
    );
    const homologated = await homologateApplication(
      jsonRequest(`http://localhost/api/applications/${id}/homologate`, { method: "POST", session: { userId: reviewer.id, accessLevel: "coe_manager" } }),
      { params: Promise.resolve({ id }) }
    );
    expect(homologated.status).toBe(409);
  });
});
