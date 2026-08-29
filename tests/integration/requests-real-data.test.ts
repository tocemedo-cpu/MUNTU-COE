import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, users } from "@/db/schema";
import { GET as getPublicStats } from "@/app/api/public-stats/route";
import { GET as getApprovers } from "@/app/api/approvers/route";
import { POST as createRequest } from "@/app/api/requests/route";

// Estes testes cobrem a substituição de dados fixos no código por dados
// reais: id de pedido gerado sem colidir com dados semeados, SLA real
// calculado a partir da prioridade (não um texto fixo), e as duas rotas
// novas que alimentam o site público/login e o dropdown de aprovadores do
// wizard.
describe("POST /api/requests — dados reais em vez de fixos", () => {
  it("gera um id REQ-2026-#### fora do intervalo de demonstração, com slaDueAt calculado a partir da prioridade", async () => {
    const before = Date.now();
    const response = await createRequest(
      jsonRequest("http://localhost/api/requests", {
        method: "POST",
        session: { userId: 1, accessLevel: "requester", companyId: null },
        body: { subject: "Teste de SLA real", priority: "Alta", supplier: "Fornecedor Teste", costCenter: "TEST-SLA" },
      })
    );
    expect(response.status).toBe(201);
    const body = await response.json();

    expect(body.request.id).toMatch(/^REQ-2026-\d{4}$/);
    expect(body.request.slaDueAt).toBeTruthy();
    expect(body.request.decidedAt).toBeNull();

    const createdAt = new Date(body.request.createdAt).getTime();
    const dueAt = new Date(body.request.slaDueAt).getTime();
    expect(dueAt - createdAt).toBeCloseTo(4 * 60 * 60 * 1000, -3); // "Alta" = 4h, lib/requests-sla.ts

    // `submitted` costumava ficar gravado como o texto fixo "Agora" para
    // sempre — agora é uma etiqueta real do momento da criação.
    expect(body.request.submitted).not.toBe("Agora");
    expect(before).toBeLessThanOrEqual(Date.now());
  });

  it("nunca colide com um id já usado, mesmo chamado muitas vezes seguidas", async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        createRequest(
          jsonRequest("http://localhost/api/requests", {
            method: "POST",
            session: { userId: 1, accessLevel: "requester", companyId: null },
            body: { subject: "Pedido concorrente" },
          })
        )
      )
    );
    const ids = await Promise.all(responses.map(async (r) => (await r.json()).request.id as string));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("GET /api/public-stats", () => {
  it("responde sem sessão nenhuma (rota pública) com números reais, não fixos", async () => {
    const response = await getPublicStats();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.activeRequests).toBe("number");
    expect(typeof body.slaOnTimePct).toBe("number");
    expect(typeof body.avgCycleDays).toBe("number");
  });
});

describe("GET /api/approvers", () => {
  it("devolve os company_admin da própria empresa e todo o pessoal coe_manager/system_admin — nunca os 3 nomes fixos que existiam antes", async () => {
    const db = getDb();
    const [companyA] = await db.insert(companies).values({ name: "Empresa Aprovadores A", domain: uniqueDomain("approvers-a") }).returning();
    const [companyB] = await db.insert(companies).values({ name: "Empresa Aprovadores B", domain: uniqueDomain("approvers-b") }).returning();

    const [adminA] = await db
      .insert(users)
      .values({ name: "Admin A", email: `admin-a-${companyA.id}@example.com`, role: "Administrador da empresa", initials: "AA", accessLevel: "company_admin", companyId: companyA.id })
      .returning();
    await db
      .insert(users)
      .values({ name: "Admin B", email: `admin-b-${companyB.id}@example.com`, role: "Administrador da empresa", initials: "AB", accessLevel: "company_admin", companyId: companyB.id })
      .returning();
    const [coeManager] = await db
      .insert(users)
      .values({ name: "Gestor COE", email: `coe-${companyA.id}@example.com`, role: "COE Manager", initials: "GC", accessLevel: "coe_manager" })
      .returning();

    const response = await getApprovers(
      jsonRequest("http://localhost/api/approvers", { method: "GET", session: { userId: adminA.id, accessLevel: "requester", companyId: companyA.id } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const names = (body.approvers as { name: string }[]).map((a) => a.name);

    expect(names).toContain(adminA.name);
    expect(names).toContain(coeManager.name);
    expect(names).not.toContain("Admin B"); // company_admin de outra empresa não deve aparecer
    expect(names).not.toContain("João Sebastião — Director de Operações"); // o dropdown fixo antigo
  });
});
