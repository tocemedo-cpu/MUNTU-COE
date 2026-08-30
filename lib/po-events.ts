import { getDb } from "@/db";
import { poEvents } from "@/db/schema";

export type PoEventType = "criada" | "confirmada" | "expediting" | "entregue" | "excepcao" | "excepcao_resolvida";

/** Regista um evento real na linha temporal de uma PO — ver
 * db/schema.ts#poEvents. userId nulo é um evento gerado pelo sistema
 * (ex.: criação a partir da aprovação de um pedido), não uma acção de
 * pessoa nenhuma. */
export async function recordPoEvent(
  db: ReturnType<typeof getDb>,
  params: { poId: string; type: PoEventType; description: string; userId?: number | null }
): Promise<void> {
  await db.insert(poEvents).values({
    poId: params.poId,
    type: params.type,
    description: params.description,
    userId: params.userId ?? null,
  });
}
