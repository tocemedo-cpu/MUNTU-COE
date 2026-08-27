import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clientInvoices, companies } from "@/db/schema";
import { generateClientInvoice } from "@/lib/billing";
import { clientInvoiceGenerateSchema, parseJsonBody } from "@/lib/validation";

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(clientInvoices).orderBy(desc(clientInvoices.createdAt));
  const companyRows = await db.select().from(companies);
  const nameById = new Map(companyRows.map((c) => [c.id, c.name]));

  return Response.json({
    clientInvoices: rows.map((row) => ({ ...row, companyName: nameById.get(row.companyId) ?? "—" })),
  });
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, clientInvoiceGenerateSchema);
  if (!parsed.success) return parsed.response;

  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, parsed.data.companyId));
  if (!company) return Response.json({ error: "Empresa não encontrada" }, { status: 404 });

  try {
    const created = await generateClientInvoice({ ...parsed.data, scope: parsed.data.scope ?? "total", generatedBy: "manual" });
    return Response.json({ clientInvoice: { ...created, companyName: company.name } }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível gerar a factura" },
      { status: 500 }
    );
  }
}
