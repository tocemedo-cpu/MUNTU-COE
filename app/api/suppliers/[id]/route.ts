import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suppliers } from "@/db/schema";
import { getSession } from "@/lib/authz";
import { parseJsonBody, supplierCompanyAdminUpdateSchema, supplierSelfUpdateSchema, supplierUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(request);
  const supplierId = Number(id);

  // Passport/risco/estado são avaliação interna da Muntu (analyst/
  // coe_manager/system_admin) — um company_admin não avalia o fornecedor
  // de outra empresa, só gere a conta bancária dele para os seus próprios
  // pagamentos (mesmo âmbito do único formulário que a UI lhe mostra,
  // SupplierPassportSheet#onUpdateBankDetails).
  const isMuntuInternal = ["analyst", "coe_manager", "system_admin"].includes(session.accessLevel);
  const isCompanyAdmin = session.accessLevel === "company_admin";
  const isOwnProfile = session.accessLevel === "supplier" && session.supplierId === supplierId;

  if (!isMuntuInternal && !isCompanyAdmin && !isOwnProfile) {
    return Response.json({ error: "Sem permissão para editar este fornecedor." }, { status: 403 });
  }

  const db = getDb();
  const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
  if (!existing) return Response.json({ error: "Fornecedor não encontrado" }, { status: 404 });

  const schema = isMuntuInternal ? supplierUpdateSchema : isCompanyAdmin ? supplierCompanyAdminUpdateSchema : supplierSelfUpdateSchema;
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
  return Response.json({ supplier: updated });
}
