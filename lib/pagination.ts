const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

/** Tecto de segurança para rotas de listagem que hoje devolvem sempre a
 * tabela inteira do âmbito, sem paginação nenhuma — sem isto, uma
 * empresa/fornecedor com muito histórico acaba por puxar uma resposta
 * sem limite de tamanho. `?limit=` é opcional e nunca obrigatório: sem
 * ele, o comportamento actual (devolver "tudo", até este tecto) não
 * muda para o frontend existente — só passa a ter um travão. */
export function parseLimit(request: Request): number {
  const raw = new URL(request.url).searchParams.get("limit");
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}
