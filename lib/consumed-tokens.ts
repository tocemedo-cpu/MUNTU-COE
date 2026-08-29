import type { getDb } from "@/db";
import { consumedTokens } from "@/db/schema";
import { isUniqueViolation } from "./db-errors";

/** Tenta marcar um jti como consumido — devolve true na primeira vez
 * (token válido, ainda não usado), false se já tinha sido consumido antes
 * (replay). A PK em jti é quem garante atomicidade real mesmo sob
 * concorrência: não há SELECT antes do INSERT, só o próprio INSERT a
 * falhar ou não — nunca duas chamadas concorrentes conseguem as duas
 * "ganhar". */
export async function consumeTokenOnce(
  db: ReturnType<typeof getDb>,
  params: { jti: string; purpose: string; expiresAt: Date }
): Promise<boolean> {
  try {
    await db.insert(consumedTokens).values(params);
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}
