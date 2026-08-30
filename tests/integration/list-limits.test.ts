import { describe, expect, it } from "vitest";
import { getDb, jsonRequest, uniqueDomain } from "./helpers";
import { companies, requests } from "@/db/schema";
import { GET as listRequests } from "@/app/api/requests/route";

// GET /api/requests não tinha paginação nenhuma — devolvia sempre a
// tabela inteira do âmbito. Isto prova que o ?limit= (lib/pagination.ts)
// é mesmo respeitado pela rota, não só pela função pura isolada
// (tests/unit/pagination.test.ts já cobre essa).
describe("GET /api/requests — tecto de listagem", () => {
  it("respects an explicit ?limit= and returns the most recent rows first", async () => {
    const db = getDb();
    const [company] = await db.insert(companies).values({ name: "Empresa Limite", domain: uniqueDomain("list-limit") }).returning();

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = `REQ-TEST-LIMIT-${Date.now()}-${i}`;
      ids.push(id);
      await db.insert(requests).values({
        id,
        subject: "Pedido de teste",
        tower: "Requisition-to-PO",
        value: 1000,
        status: "Validação",
        priority: "Normal",
        owner: "Teste",
        companyId: company.id,
        sla: "24h",
        stage: 1,
        submitted: "hoje",
        supplier: "Fornecedor Teste",
        costCenter: "TEST",
      });
    }

    const response = await listRequests(
      jsonRequest(`http://localhost/api/requests?limit=2`, {
        method: "GET",
        session: { userId: 1, accessLevel: "company_admin", companyId: company.id },
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.requests).toHaveLength(2);
    // Mais recentes primeiro (orderBy desc(createdAt)) — os dois últimos
    // inseridos (índices 4 e 3).
    expect(body.requests[0].id).toBe(ids[4]);
    expect(body.requests[1].id).toBe(ids[3]);
  });
});
