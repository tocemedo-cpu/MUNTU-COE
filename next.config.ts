import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Next.js 16.3+ regenera AGENTS.md/CLAUDE.md a cada `next dev` — ruído
  // sem relação com este projecto (que já documenta as suas convenções no
  // README), desligado para não aparecer como diff em cada sessão local.
  agentRules: false,
};

// Sem SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT definidos, isto só
// embrulha o runtime (para instrumentation.ts funcionar) — não tenta
// enviar source maps nem release nenhuma para o Sentry, e não falha o
// build. Mesmo princípio de activação opcional que o resto da app.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
