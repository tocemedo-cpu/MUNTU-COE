import { getDb } from "@/db";
import { requests } from "@/db/schema";
import { computeAvgCycleDays, computeSlaOnTimePct } from "@/lib/requests-sla";

// Estatísticas agregadas e não sensíveis (contagens/percentagens, sem
// valores em AOA nem nomes) para o site público e o ecrã de login — a
// única rota de API sem sessão exigida além de auth/*. Substitui os
// números fixos no código (96,4% SLA, 42 pedidos activos, 3,2 dias de
// ciclo) que apareciam ali antes de o utilizador sequer iniciar sessão.
export async function GET() {
  const db = getDb();
  const all = await db.select().from(requests);

  return Response.json({
    activeRequests: all.filter((item) => !["Pago", "Rejeitado"].includes(item.status)).length,
    slaOnTimePct: computeSlaOnTimePct(all),
    avgCycleDays: computeAvgCycleDays(all),
  });
}
