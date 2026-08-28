import type { AccessLevel } from "@/lib/session";

if (!process.env.DATABASE_URL?.includes("sslmode=disable")) {
  throw new Error(
    "Os testes de integração esperam um Postgres LOCAL (DATABASE_URL com ?sslmode=disable), nunca a base de dados de produção. " +
      "Corra via `npm run test:integration` (ver README §Testes)."
  );
}

// Importado depois da verificação acima, para nunca abrir uma ligação
// antes de confirmar que o alvo é mesmo a base de dados de testes local.
export { getDb } from "@/db";

let companyCounter = 0;

/** Cria uma empresa isolada com domínio único, para cada ficheiro de teste
 * ter os seus próprios dados e não depender da ordem de execução nem dos
 * dados semeados por `seedIfEmpty`. */
export function uniqueDomain(label: string): string {
  companyCounter += 1;
  return `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${companyCounter}.test`;
}

export type FakeSession = {
  userId: number;
  accessLevel: AccessLevel;
  companyId?: number | null;
  supplierId?: number | null;
};

/** Simula os headers que middleware.ts injecta depois de verificar a
 * sessão — os testes de integração chamam os handlers de rota
 * directamente (sem servidor Next.js a decorrer), pelo que a verificação
 * de sessão/CSRF do middleware fica fora deste âmbito por desenho: já é
 * exercida pelo `forbidUnless`/scoping dentro de cada handler, que é o
 * que estes testes cobrem. */
export function sessionHeaders(session: FakeSession): HeadersInit {
  return {
    "content-type": "application/json",
    "x-muntu-user-id": String(session.userId),
    "x-muntu-access-level": session.accessLevel,
    "x-muntu-company-id": session.companyId != null ? String(session.companyId) : "",
    "x-muntu-supplier-id": session.supplierId != null ? String(session.supplierId) : "",
  };
}

export function jsonRequest(url: string, options: { method: string; session?: FakeSession; body?: unknown }): Request {
  const headers = options.session ? sessionHeaders(options.session) : { "content-type": "application/json" };
  return new Request(url, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}
