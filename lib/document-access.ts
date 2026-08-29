import { eq } from "drizzle-orm";
import type { getDb } from "@/db";
import { exceptions, invoices, purchaseOrders, receipts, requests } from "@/db/schema";
import type { RequestSession } from "./authz";

export const DOCUMENT_ENTITY_TYPES = ["request", "supplier", "invoice", "receipt", "exception", "purchase_order"] as const;
export type DocumentEntityType = (typeof DOCUMENT_ENTITY_TYPES)[number];

export function isDocumentEntityType(value: string): value is DocumentEntityType {
  return (DOCUMENT_ENTITY_TYPES as readonly string[]).includes(value);
}

// Autorização real por entidade para documentos ligados a um pedido,
// fornecedor, factura, recepção, excepção ou PO — replica exactamente as
// mesmas regras já aplicadas nas rotas GET dessas entidades (dono/mesma
// empresa/mesmo fornecedor), só que aqui centralizada para servir os
// botões "Ver evidência"/"Ver Supplier Passport"/etc. Devolve false tanto
// para "não tem permissão" como para "a entidade não existe" — o
// chamador trata os dois casos da mesma forma (404/403 genérico), para
// nunca confirmar a um utilizador sem acesso se um id existe ou não.
export async function canAccessDocumentEntity(
  db: ReturnType<typeof getDb>,
  session: RequestSession,
  entityType: string,
  entityId: string
): Promise<boolean> {
  if (!isDocumentEntityType(entityType)) return false;
  if (session.accessLevel === "coe_manager" || session.accessLevel === "system_admin") return true;

  switch (entityType) {
    case "request": {
      const [row] = await db.select().from(requests).where(eq(requests.id, entityId));
      if (!row) return false;
      if (session.accessLevel === "requester") return row.ownerUserId === session.userId;
      if (session.accessLevel === "company_admin") return row.companyId === session.companyId;
      return false;
    }
    case "supplier": {
      if (session.accessLevel === "supplier") return session.supplierId === Number(entityId);
      return session.accessLevel === "company_admin" || session.accessLevel === "analyst";
    }
    case "purchase_order": {
      const [row] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, entityId));
      if (!row) return false;
      if (session.accessLevel === "supplier") return row.supplierId === session.supplierId;
      if (session.accessLevel === "company_admin") return row.companyId === session.companyId;
      return session.accessLevel === "analyst";
    }
    case "invoice": {
      const [row] = await db.select().from(invoices).where(eq(invoices.id, entityId));
      if (!row) return false;
      if (session.accessLevel === "supplier") return row.supplierId === session.supplierId;
      if (session.accessLevel === "company_admin") return row.companyId === session.companyId;
      return session.accessLevel === "analyst";
    }
    case "receipt": {
      const [row] = await db.select().from(receipts).where(eq(receipts.id, Number(entityId)));
      if (!row) return false;
      if (session.accessLevel === "supplier") return row.supplierId === session.supplierId;
      if (session.accessLevel === "company_admin") return row.companyId === session.companyId;
      return session.accessLevel === "analyst";
    }
    case "exception": {
      const [row] = await db.select().from(exceptions).where(eq(exceptions.id, entityId));
      if (!row) return false;
      if (session.accessLevel === "company_admin") return row.companyId === session.companyId;
      return session.accessLevel === "analyst";
    }
    default:
      return false;
  }
}
