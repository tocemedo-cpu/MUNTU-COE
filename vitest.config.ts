import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Só os testes unitários — não precisam de nenhuma base de dados.
    // Os de integração (tests/integration) correm à parte via
    // `npm run test:integration`, contra um Postgres local (ver README).
    include: ["tests/unit/**/*.test.ts"],
  },
});
