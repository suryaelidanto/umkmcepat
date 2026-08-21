import { existsSync } from "node:fs";
import path from "node:path";

import { Generator, getConfig } from "@tanstack/router-generator";

import { createCheckFingerprint, runCachedCheck } from "./check-cache";

const root = process.cwd();
const routeTreePath = path.join(root, "src/routeTree.gen.ts");
const useCache =
  process.argv.includes("--cache") && !process.argv.includes("--no-cache");
const fingerprint = createCheckFingerprint(
  "routes",
  ["bun", "scripts/generate-route-tree.ts"],
  [
    { extensions: [".ts", ".tsx"], path: "src/routes" },
    { path: "package.json" },
    { path: "bun.lock" },
    { path: "scripts/check-cache.ts" },
    { path: "scripts/generate-route-tree.ts" },
    { path: "tsconfig.json" },
  ],
  root,
);

const result = await runCachedCheck({
  cacheDirectory: path.join(root, ".cache", "check"),
  fingerprint,
  run: async () => {
    const config = getConfig(
      {
        disableTypes: false,
        autoCodeSplitting: false,
      },
      root,
    );
    const generator = new Generator({ config, root });
    await generator.run();
    return { ok: true, output: "" };
  },
  task: "routes",
  useCache: useCache && existsSync(routeTreePath),
});

console.log(`  \u001b[32m✓\u001b[0m routes${result.cached ? " (cached)" : ""}`);
