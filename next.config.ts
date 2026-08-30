import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Next.js 16.3+ regenera AGENTS.md/CLAUDE.md a cada `next dev` — ruído
  // sem relação com este projecto (que já documenta as suas convenções no
  // README), desligado para não aparecer como diff em cada sessão local.
  agentRules: false,
};

export default nextConfig;
