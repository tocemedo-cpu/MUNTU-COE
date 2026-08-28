import path from "node:path";
import { defineConfig } from "vitest/config";

// Testes de integração ligam a um Postgres local real (ver README §Testes) —
// correm à parte dos testes unitários (`npm test`), que não precisam de
// nenhuma base de dados. `fileParallelism: false` porque todos os ficheiros
// partilham a mesma ligação/pool contra uma única instância Postgres local.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
