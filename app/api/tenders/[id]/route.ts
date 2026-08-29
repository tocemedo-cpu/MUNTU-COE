import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bids, suppliers, tenderInvites, tenders } from "@/db/schema";
import { forbidUnless, getSession } from "@/lib/authz";
import { parseJsonBody, tenderActionSchema } from "@/lib/validation";

// Um fornecedor nunca pode ver as propostas dos concorrentes — só a sua
// própria — por isso o detalhe devolvido varia por quem pergunta: o
// comprador (empresa/Muntu) vê todas as propostas e a lista de convidados;
// um fornecedor convidado vê só a sua própria proposta (bidRows já filtrado
// por supplierId antes de chegar ao JSON).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [tender] = await db.select().from(tenders).where(eq(tenders.id, id));
  if (!tender) return Response.json({ error: "Tender não encontrado" }, { status: 404 });

  const session = getSession(request);

  if (session.accessLevel === "supplier") {
    if (session.supplierId == null) return Response.json({ error: "Sem permissão para aceder a este tender." }, { status: 403 });
    const invited = await db.select().from(tenderInvites).where(eq(tenderInvites.tenderId, id));
    if (!invited.some((row) => row.supplierId === session.supplierId)) {
      return Response.json({ error: "Sem permissão para aceder a este tender." }, { status: 403 });
    }
    const myBidRows = await db.select().from(bids).where(eq(bids.tenderId, id));
    const myBid = myBidRows.find((row) => row.supplierId === session.supplierId) ?? null;
    return Response.json({ tender, myBid });
  }

  if (session.accessLevel === "company_admin" && session.companyId !== tender.companyId) {
    return Response.json({ error: "Sem permissão para aceder a este tender." }, { status: 403 });
  }

  const invites = await db
    .select({ supplierId: tenderInvites.supplierId, supplierName: suppliers.name })
    .from(tenderInvites)
    .innerJoin(suppliers, eq(tenderInvites.supplierId, suppliers.id))
    .where(eq(tenderInvites.tenderId, id));
  const bidRows = await db
    .select({ bid: bids, supplierName: suppliers.name })
    .from(bids)
    .innerJoin(suppliers, eq(bids.supplierId, suppliers.id))
    .where(eq(bids.tenderId, id));

  return Response.json({
    tender,
    invites,
    bids: bidRows.map((row) => ({ ...row.bid, supplierName: row.supplierName })),
  });
}

// Única transição suportada aqui é o cancelamento — adjudicar tem a sua
// própria rota (award) porque cria a PO e decide vencedor/perdedores numa
// única transacção, não é um simples PATCH de estado.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = forbidUnless(request, ["company_admin", "analyst", "coe_manager", "system_admin"]);
  if (forbidden) return forbidden;

  const { id } = await params;
  const db = getDb();
  const parsed = await parseJsonBody(request, tenderActionSchema);
  if (!parsed.success) return parsed.response;

  const [existing] = await db.select().from(tenders).where(eq(tenders.id, id));
  if (!existing) return Response.json({ error: "Tender não encontrado" }, { status: 404 });

  const session = getSession(request);
  if (session.accessLevel === "company_admin" && session.companyId !== existing.companyId) {
    return Response.json({ error: "Sem permissão para aceder a este tender." }, { status: 403 });
  }
  if (existing.status !== "aberto") {
    return Response.json({ error: "Só é possível cancelar um tender ainda aberto." }, { status: 400 });
  }

  const [updated] = await db.update(tenders).set({ status: "cancelado" }).where(eq(tenders.id, id)).returning();
  return Response.json({ tender: updated });
}
