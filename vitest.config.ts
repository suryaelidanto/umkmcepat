import path from "node:path";

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const storybookConfigDir = path
  .resolve(__dirname, ".storybook")
  .replace(/\\/g, "/");

export default defineConfig({
  optimizeDeps: {
    include: ["react-resizable-panels"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
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
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        extends: true,
        plugins: [storybookTest({ configDir: storybookConfigDir })],
        test: {
          name: `storybook:${storybookConfigDir}`,
          browser: {
            api: { port: 0 },
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
            provider: playwright({}),
          },
        },
      },
    ],
  },
});
