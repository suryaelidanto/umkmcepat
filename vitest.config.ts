import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  optimizeDeps: {
    include: ["react-resizable-panels"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    forceRerunTriggers: [],
    testTimeout: 20_000,
    coverage: {
      watermarks: {
        statements: [0, 40],
      },
    },
    projects: [
      {
        extends: true,
        test: {
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "src/**/*.test.tsx",
            "tests/unit/**/*.test.ts",
            "tests/unit/**/*.test.tsx",
            "scripts/**/*.test.ts",
            "tests/**/*.test.ts",
          ],
          name: "unit",
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/integration/**/*.itest.ts"],
          name: "integration",
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          include: ["tests/browser/**/*.browser.test.ts"],
          name: "browser",
        },
      },
    ],
  },
});
