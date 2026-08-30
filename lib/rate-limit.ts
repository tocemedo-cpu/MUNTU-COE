// Limitador de taxa em memória, por janela deslizante — chega para a
// única instância que este app corre hoje (plano free do Render, ver
// render.yaml). Se algum dia correr em mais do que uma instância, cada
// uma conta à parte e isto deixa de ser suficiente — nesse caso, passar
// para um store partilhado (Redis, ou uma tabela Postgres com upsert).
const buckets = new Map<string, number[]>();

/** true se `key` já esgotou `limit` pedidos na janela de `windowMs`
 * (e regista este pedido se não esgotou). As entradas esvaziam-se
 * sozinhas com o tempo — sem isto, o Map cresceria sem limite. */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  const limited = timestamps.length >= limit;
  if (!limited) timestamps.push(now);
  if (timestamps.length === 0) buckets.delete(key);
  else buckets.set(key, timestamps);
  return limited;
}

/** IP de quem chamou, a partir de x-forwarded-for (Render, como a maioria
 * dos PaaS, corre a app atrás de um proxy — request.headers não tem o IP
 * real sem isto). "unknown" agrupa todos os pedidos sem o cabeçalho no
 * mesmo balde — aceitável como pior caso, nunca pior do que não limitar. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export function rateLimitResponse(): Response {
  return Response.json({ error: "Demasiados pedidos. Tente novamente dentro de alguns minutos." }, { status: 429 });
}
