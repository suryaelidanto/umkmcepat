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
    // `package.json` and `vitest.config.ts` changes would otherwise force a
    // full rerun. We want `--changed HEAD~1` to filter by source diff only so
    // the pre-commit gate stays fast on config-only commits.
    forceRerunTriggers: [],
    // Some unit tests import route modules (e.g. `api.projects.preview.ts`)
    // whose cold-transform + module-graph cost exceeds the 5s default on
    // first run. Tests themselves stay well under a second; this only buys
    // headroom for the import phase. ponytail: cap at 30s and add per-file
    // `vi.setConfig({ testTimeout })` if a single test needs more.
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
