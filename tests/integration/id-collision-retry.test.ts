import { describe, expect, it, vi } from "vitest";
import { getDb, jsonRequest } from "./helpers";
import { requests } from "@/db/schema";
import { POST as createRequest } from "@/app/api/requests/route";

// lib/db-errors.ts#isUniqueViolation existia antes só copiado inline em 4
// sítios (requests/support/applications/consumed-tokens), cada um a
// verificar `error.code === "23505"` directamente — mas o driver por
// vezes embrulha o erro real do Postgres num wrapper com `.cause`, e
// nesse caso `error.code` fica undefined: a "nova tentativa em caso de
// colisão" nunca disparava de verdade, só se via a colisão original a
// ser relançada. Só foi apanhado ao escrever um teste de uso único de
// tokens que força uma colisão real (em vez de confiar no espaço de ids
// aleatório nunca colidir num teste normal). Este teste força a mesma
// colisão real contra /api/requests para garantir que a correcção
// (lib/db-errors.ts, partilhada pelos 4 sítios) fica coberta.
describe("insertRequestWithGeneratedId retries on a forced real collision", () => {
  it("succeeds even when Math.random is rigged to collide on the first attempt", async () => {
    const db = getDb();
    // Pre-insert a row at the exact id the rigged Math.random will produce first.
    const riggedId = "REQ-2026-1000";
    await db.insert(requests).values({
      id: riggedId, subject: "x", tower: "Requisition-to-PO", value: 0, status: "Validação",
      priority: "Normal", owner: "x", sla: "16 horas", stage: 1, submitted: "agora", supplier: "x", costCenter: "x",
    });

    let call = 0;
    const spy = vi.spyOn(Math, "random").mockImplementation(() => (call++ === 0 ? 0 : 0.5));

    const response = await createRequest(
      jsonRequest("http://localhost/api/requests", { method: "POST", session: { userId: 1, accessLevel: "requester" }, body: { subject: "Colisão forçada" } })
    );
    spy.mockRestore();

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.request.id).not.toBe(riggedId);
  });
});
