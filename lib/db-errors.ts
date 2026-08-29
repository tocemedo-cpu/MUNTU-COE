/** Verifica se um erro apanhado de uma escrita é uma violação de
 * unicidade do Postgres (23505) — usado por todo o padrão "id aleatório +
 * nova tentativa em caso de colisão" espalhado pela app (requests, POs,
 * pedidos de suporte, candidaturas, tokens de uso único). O driver por
 * vezes embrulha o erro real num wrapper com `.cause` (ex.:
 * DrizzleQueryError) — o código pode estar num sítio ou no outro
 * consoante a versão, por isso verificam-se os dois. */
export function isUniqueViolation(error: unknown): boolean {
  const pgError = error as { code?: string; cause?: { code?: string } } | undefined;
  return pgError?.code === "23505" || pgError?.cause?.code === "23505";
}
