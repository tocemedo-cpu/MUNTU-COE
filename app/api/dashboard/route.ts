import { getDb } from "@/db";
import { requests } from "@/db/schema";

const stages = ["Intake", "Validação", "Aprovação", "PO", "Receção", "Factura", "Excepção", "Pagamento"];

export async function GET() {
  const db = getDb();
  const all = db.select().from(requests).all();

  const active = all.filter((item) => !["Pago", "Rejeitado"].includes(item.status)).length;
  const totalValue = all.reduce((sum, item) => sum + item.value, 0);
  const pipeline = stages.map((_, index) => all.filter((item) => item.stage === index).length);

  return Response.json({
    activeRequests: active,
    inApproval: all.filter((item) => item.status === "Aprovação").length,
    totalValueInFlow: totalValue,
    transactionCount: all.length,
    stages,
    pipeline,
    recent: [...all]
      .sort((a, b) => (a.submitted < b.submitted ? 1 : -1))
      .slice(0, 4),
  });
}
