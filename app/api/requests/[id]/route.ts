import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { purchaseOrders, requests, suppliers } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { forbidUnless, getSession } from "@/lib/authz";
import { classifyPoTier } from "@/lib/billing";
import { isUniqueViolation } from "@/lib/db-errors";
import { recordPoEvent } from "@/lib/po-events";
import { checkSupplierRiskBlock } from "@/lib/risk-block";
import { assertDifferentActor } from "@/lib/sod";
import { parseJsonBody, requestActionSchema } from "@/lib/validation";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(requests).where(eq(requests.id, id));
  if (!row) return Response.json({ error: "Pedido não encontrado" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel === "requester" && row.ownerUserId !== session.userId) {
    return Response.json({ error: "Sem permissão para aceder a este pedido." }, { status: 403 });
  }
  // Mesmo motivo do GET da lista (app/api/requests/route.ts): nenhum
  // destes níveis tem noção de "dono" de pedido — sem esta guarda, um id
  // adivinhado/enumerado devolvia o pedido de qualquer empresa.
  const NO_REQUEST_ACCESS: (typeof session.accessLevel)[] = ["analyst", "supplier", "technical_evaluator", "consignee", "finance_ap", "supplier_governance"];
  if (NO_REQUEST_ACCESS.includes(session.accessLevel)) {
    return Response.json({ error: "Sem permissão para aceder a este pedido." }, { status: 403 });
  }

  return Response.json({ request: row });
}

// Aprovação de pedido — governance de negócio, fora do system_admin desde
// o redesenho de RBAC (ver README §Personas e permissões); system_admin
// mantém IAM/config/auditoria, nunca decide sobre o P2P em si.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["company_admin", "coe_manager"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, requestActionSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(requests).where(eq(requests.id, id));
  if (!existing) return Response.json({ error: "Pedido não encontrado" }, { status: 404 });

  const approve = parsed.data.action === "approve";
  const session = getSession(request);

  // Segregação de funções: quem aprova/rejeita nunca pode ser quem criou
  // o pedido — sem isto, um company_admin podia aprovar o seu próprio
  // pedido sozinho.
  const selfApproval = assertDifferentActor(session.userId, existing.ownerUserId, "Não pode aprovar/rejeitar o seu próprio pedido.");
  if (selfApproval) return selfApproval;

  // Aprovar um pedido de um fornecedor de risco "Alto" fica bloqueado por
  // omissão — ver lib/risk-block.ts. Verificado antes de decidir nada:
  // um pedido bloqueado tem de continuar por decidir, não ficar
  // "aprovado" sem PO nenhuma.
  let riskOverriddenByUserId: number | null = null;
  if (approve) {
    const [supplierRow] = await db.select().from(suppliers).where(eq(suppliers.name, existing.supplier));
    if (supplierRow) {
      const riskCheck = checkSupplierRiskBlock({ risk: supplierRow.risk, accessLevel: session.accessLevel, overrideRisk: parsed.data.overrideRisk });
      if (riskCheck.blocked) {
        return Response.json({ error: riskCheck.reason, riskBlock: true, canOverride: riskCheck.canOverride }, { status: 409 });
      }
      if (parsed.data.overrideRisk) riskOverriddenByUserId = session.userId;
    }
  }

  const [updated] = await db
    .update(requests)
    .set({
      status: approve ? "Em execução" : "Rejeitado",
      stage: approve ? Math.max(existing.stage, 3) : existing.stage,
      sla: approve ? "Dentro do SLA" : "Encerrado",
      decidedAt: new Date(),
    })
    .where(eq(requests.id, id))
    .returning();

  // Aprovar gera a PO ligada ao pedido — é isto que alimenta a execução
  // P2P (e, mais tarde, a facturação de actividade) com dados reais em
  // vez de datasets paralelos sem ligação nenhuma ao pedido de origem.
  if (approve) {
    const [existingPo] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.requestId, id));
    if (!existingPo) {
      const newPoId = await insertPurchaseOrderWithGeneratedId(db, {
        supplier: existing.supplier,
        description: existing.subject,
        value: existing.value,
        status: "Confirmado",
        nextAction: "Expediting",
        requestId: existing.id,
        companyId: existing.companyId,
        tier: classifyPoTier(existing.type),
        riskOverriddenByUserId,
        riskOverriddenAt: riskOverriddenByUserId ? new Date() : null,
      });
      await recordPoEvent(db, {
        poId: newPoId,
        type: "criada",
        description: riskOverriddenByUserId
          ? `PO criada a partir do pedido ${existing.id} — fornecedor de risco alto aprovado com override`
          : `PO criada a partir do pedido ${existing.id}`,
        userId: session.userId,
      });
    }
  }

  await recordAuditEvent(db, {
    actorUserId: session.userId,
    action: approve ? "request.approve" : "request.reject",
    entityType: "request",
    entityId: id,
    before: { status: existing.status },
    after: { status: updated.status },
    metadata: riskOverriddenByUserId ? { riskOverride: true } : undefined,
  });

  return Response.json({ request: updated });
}

type NewPurchaseOrder = Omit<typeof purchaseOrders.$inferInsert, "id">;

// Um id baseado em COUNT(*) colide assim que a tabela tem qualquer linha
// fora dessa sequência (dados semeados, POs de outra origem) — e ainda
// tem uma condição de corrida entre aprovações concorrentes. Em vez
// disso, sorteia um id no mesmo intervalo visual da tabela de demonstração
// e volta a tentar no caso (extremamente raro) de colisão real.
async function insertPurchaseOrderWithGeneratedId(db: ReturnType<typeof getDb>, values: NewPurchaseOrder): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `PO-${6_100_000 + Math.floor(Math.random() * 900_000)}`;
    try {
      await db.insert(purchaseOrders).values({ id, ...values });
      return id;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }
  throw new Error("Não foi possível gerar um id de PO único");
}
