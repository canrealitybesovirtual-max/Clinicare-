import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests for server-side API adapters and Phase 2/3 libraries. Merged into the main suite once stable.
export default defineConfig({
  resolve: {
    alias: {
      "@content": path.resolve(__dirname, "content"),
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/integrations/server-only-stub.ts"),
    },
  },
  test: { include: ["tests/integrations/**/*.test.ts"], environment: "node" },
});
