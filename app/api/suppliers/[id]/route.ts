import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suppliers } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit";
import { getSession } from "@/lib/authz";
import { parseJsonBody, supplierSelfUpdateSchema, supplierUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(request);
  const supplierId = Number(id);

  // Passport/risco/estado/IBAN são gestão de risco e vendor governance —
  // só coe_manager (governance de negócio) e supplier_governance
  // (fundação dedicada ao ciclo de vida do fornecedor), desde o
  // redesenho de RBAC (ver README §Personas e permissões). company_admin
  // e analyst deixaram de conseguir editar fornecedor nenhum — um
  // cliente não avalia o risco/conta bancária do fornecedor de outra
  // empresa, e um buyer não decide sobre risco/homologação.
  const isMuntuInternal = session.accessLevel === "coe_manager" || session.accessLevel === "supplier_governance";
  const isOwnProfile = session.accessLevel === "supplier" && session.supplierId === supplierId;

  if (!isMuntuInternal && !isOwnProfile) {
    return Response.json({ error: "Sem permissão para editar este fornecedor." }, { status: 403 });
  }

  const db = getDb();
  const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
  if (!existing) return Response.json({ error: "Fornecedor não encontrado" }, { status: 404 });

  const schema = isMuntuInternal ? supplierUpdateSchema : supplierSelfUpdateSchema;
  const parsed = await parseJsonBody(request, schema);
  if (!parsed.success) return parsed.response;

  // Um corpo só com campos que este schema não reconhece (ex.: um
  // fornecedor a tentar mandar iban/bic, que supplierSelfUpdateSchema
  // ignora) chega aqui como {} — sem esta guarda, o update()
  // rebentava com "No values to set" em vez de responder com um erro
  // claro.
  if (Object.keys(parsed.data).length === 0) {
    return Response.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  const [updated] = await db.update(suppliers).set(parsed.data).where(eq(suppliers.id, supplierId)).returning();

  if (isMuntuInternal) {
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(parsed.data) as (keyof typeof parsed.data)[]) {
      before[key] = existing[key as keyof typeof existing];
      after[key] = updated[key as keyof typeof updated];
    }
    const sensitiveFieldsChanged = ["risk", "iban", "bic", "status"].some((key) => key in parsed.data);
    await recordAuditEvent(db, {
      actorUserId: session.userId,
      action: sensitiveFieldsChanged ? "supplier.risk_change" : "supplier.update",
      entityType: "supplier",
      entityId: supplierId,
      before,
      after,
    });
  }

  return Response.json({ supplier: updated });
}
