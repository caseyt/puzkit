import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
      thresholds: { lines: 100, functions: 100, statements: 100, branches: 95 },
    },
  },
});
