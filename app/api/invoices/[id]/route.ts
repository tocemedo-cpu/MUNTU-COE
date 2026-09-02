import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { forbidUnless, getSession } from "@/lib/authz";
import { classifyInvoiceTier } from "@/lib/billing";
import { invoiceMatchActionSchema, parseJsonBody } from "@/lib/validation";

// Mesmo valor por omissão para status quando o chamador não o indica —
// espelha lib/billing-tiers.ts#classifyInvoiceTier, que já assume estes
// três valores de `match`.
const DEFAULT_STATUS_FOR_MATCH: Record<string, string> = {
  "3-way match": "Validada",
  "Preço divergente": "Excepção",
  "Receção em falta": "Pendente",
};

// Validação do 3-way match — finance_ap/coe_manager, separado do
// system_admin desde o redesenho de RBAC (ver README §Personas e
// permissões). É a primeira mutação real sobre facturas: até aqui `match`
// só vinha de dados semeados, nunca de uma acção de utilizador.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["finance_ap", "coe_manager"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, invoiceMatchActionSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!existing) return Response.json({ error: "Factura não encontrada" }, { status: 404 });

  const session = getSession(request);
  const status = parsed.data.status ?? DEFAULT_STATUS_FOR_MATCH[parsed.data.match];
  const tier = classifyInvoiceTier({ match: parsed.data.match, status });

  const [updated] = await db
    .update(invoices)
    .set({
      match: parsed.data.match,
      status,
      tier,
      matchedByUserId: session.userId,
      matchedAt: new Date(),
    })
    .where(eq(invoices.id, id))
    .returning();

  await recordAuditEvent(db, {
    actorUserId: session.userId,
    action: "invoice.match",
    entityType: "invoice",
    entityId: id,
    before: { match: existing.match, status: existing.status },
    after: { match: updated.match, status: updated.status },
  });

  return Response.json({ invoice: updated });
}
