import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientInvoiceLines, clientInvoices, companies } from "@/db/schema";
import { getSession } from "@/lib/authz";
import { clientInvoiceActionSchema, parseJsonBody } from "@/lib/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [row] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, id));
  if (!row) return Response.json({ error: "Factura não encontrada" }, { status: 404 });

  const [company] = await db.select().from(companies).where(eq(companies.id, row.companyId));
  const lines = await db.select().from(clientInvoiceLines).where(eq(clientInvoiceLines.clientInvoiceId, id));

  return Response.json({ clientInvoice: { ...row, companyName: company?.name ?? "—" }, lines });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, clientInvoiceActionSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(clientInvoices).where(eq(clientInvoices.id, id));
  if (!existing) return Response.json({ error: "Factura não encontrada" }, { status: 404 });

  const nextStatus =
    parsed.data.action === "approve" ? "aprovada" : parsed.data.action === "reject" ? "rejeitada" : "enviada_contabilidade";

  if (parsed.data.action === "send_to_accounting" && existing.status !== "aprovada") {
    return Response.json({ error: "Só é possível enviar à contabilidade uma factura já aprovada." }, { status: 400 });
  }

  const session = getSession(request);
  const [updated] = await db
    .update(clientInvoices)
    .set({
      status: nextStatus,
      reviewedByUserId: session.userId,
      reviewedAt: new Date(),
    })
    .where(eq(clientInvoices.id, id))
    .returning();

  return Response.json({ clientInvoice: updated });
}
