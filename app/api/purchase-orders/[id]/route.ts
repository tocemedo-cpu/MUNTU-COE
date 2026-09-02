import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { poEvents, purchaseOrders } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { recordPoEvent } from "@/lib/po-events";
import { parseJsonBody, poActionSchema } from "@/lib/validation";

function forbiddenForPo(
  session: ReturnType<typeof getSession>,
  po: typeof purchaseOrders.$inferSelect,
): boolean {
  if (session.accessLevel === "company_admin" || session.accessLevel === "consignee") return po.companyId !== session.companyId;
  if (session.accessLevel === "supplier") return po.supplierId !== session.supplierId;
  return false;
}

// Devolve a PO e a sua linha temporal real (db/schema.ts#poEvents) — sem
// isto o frontend teria de continuar a aproximar a timeline a partir de
// outros dados, que é exactamente o que esta tabela veio substituir.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!po) return Response.json({ error: "PO não encontrada" }, { status: 404 });

  const session = getSession(request);
  if (forbiddenForPo(session, po)) {
    return Response.json({ error: "Sem permissão para aceder a esta PO." }, { status: 403 });
  }

  const events = await db.select().from(poEvents).where(eq(poEvents.poId, id)).orderBy(asc(poEvents.createdAt));
  return Response.json({ purchaseOrder: po, events });
}

// Transições de estado suportadas — cada uma valida a pré-condição (o
// estado actual tem de fazer sentido para a acção pedida) e regista um
// evento real, nunca um estado calculado. Sem fornecedor: quem executa o
// trabalho é a Muntu/empresa, não o próprio fornecedor.
const TRANSITIONS: Record<
  "ship" | "deliver" | "flag_exception" | "resolve_exception",
  { from: string[]; status: string; nextAction: string; eventType: "expediting" | "entregue" | "excepcao" | "excepcao_resolvida"; label: string }
> = {
  ship: { from: ["Confirmado"], status: "Expediting", nextAction: "Confirmar entrega", eventType: "expediting", label: "PO em expediting" },
  deliver: { from: ["Expediting"], status: "Entregue", nextAction: "", eventType: "entregue", label: "PO entregue" },
  flag_exception: {
    from: ["Confirmado", "Expediting"],
    status: "Excepção",
    nextAction: "Resolver excepção",
    eventType: "excepcao",
    label: "Excepção registada",
  },
  resolve_exception: {
    from: ["Excepção"],
    status: "Expediting",
    nextAction: "Confirmar entrega",
    eventType: "excepcao_resolvida",
    label: "Excepção resolvida — PO retoma expediting",
  },
};

// Procurement, fora do system_admin desde o redesenho de RBAC (ver README
// §Personas e permissões). consignee entra só para o GRN (confirmar
// entrega) — nunca para expediting/excepção, que continuam do lado
// buyer/AP.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager", "consignee"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, poActionSchema);
  if (!parsed.success) return parsed.response;

  const session = getSession(request);
  if (session.accessLevel === "consignee" && parsed.data.action !== "deliver") {
    return Response.json({ error: "Um consignee só pode confirmar a entrega (GRN)." }, { status: 403 });
  }

  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!po) return Response.json({ error: "PO não encontrada" }, { status: 404 });

  if (forbiddenForPo(session, po)) {
    return Response.json({ error: "Sem permissão para aceder a esta PO." }, { status: 403 });
  }

  const transition = TRANSITIONS[parsed.data.action];
  if (!transition.from.includes(po.status)) {
    return Response.json(
      { error: `Não é possível aplicar esta acção a uma PO no estado "${po.status}".` },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(purchaseOrders)
    .set({ status: transition.status, nextAction: transition.nextAction })
    .where(eq(purchaseOrders.id, id))
    .returning();

  await recordPoEvent(db, {
    poId: id,
    type: transition.eventType,
    description: parsed.data.note ? `${transition.label} — ${parsed.data.note}` : transition.label,
    userId: session.userId,
  });

  return Response.json({ purchaseOrder: updated });
}
