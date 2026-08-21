import { spawn } from "node:child_process";
import path from "node:path";

import {
  createCheckFingerprint,
  type CheckExecutionResult,
  type CheckFingerprintInput,
  runCachedCheck,
} from "./check-cache";

interface CheckStep {
  args: string[];
  command: string;
  inputs: CheckFingerprintInput[];
  label: string;
}

const sourceInputs: CheckFingerprintInput[] = [
  { extensions: [".ts", ".tsx"], path: "src" },
  { extensions: [".ts", ".tsx"], path: "tests" },
  { extensions: [".ts", ".tsx"], path: "scripts" },
  { path: "package.json" },
  { path: "bun.lock" },
  { path: "tsconfig.json" },
  { path: "vite.config.ts" },
  { path: "vitest.config.ts" },
];

const steps: CheckStep[] = [
  {
    args: ["run", "format:check"],
    command: "bun",
    inputs: [
      {
        extensions: [
          ".css",
          ".js",
          ".jsx",
          ".json",
          ".md",
          ".ts",
          ".tsx",
          ".yaml",
          ".yml",
        ],
        path: ".",
      },
      { path: ".prettierignore" },
    ],
    label: "format",
  },
  {
    args: ["run", "lint"],
    command: "bun",
    inputs: [...sourceInputs, { path: "eslint.config.js" }],
    label: "lint",
  },
  {
    args: ["run", "typecheck"],
    command: "bun",
    inputs: sourceInputs,
    label: "typecheck",
  },
  {
    args: ["run", "test:changed"],
    command: "bun",
    inputs: sourceInputs,
    label: "test",
  },
  {
    args: ["run", "knip"],
    command: "bun",
    inputs: [...sourceInputs, { path: "knip.json" }],
    label: "knip",
  },
  {
    args: ["run", "check:discipline"],
    command: "bun",
    inputs: [
      { extensions: [".ts", ".tsx"], path: "src" },
      { extensions: [".ts", ".tsx"], path: "tests" },
      { extensions: [".ts", ".tsx"], path: "scripts" },
    ],
    label: "discipline",
  },
  {
    args: ["run", "check:docs"],
    command: "bun",
    inputs: [
      { extensions: [".md"], path: "." },
      { path: "scripts/check-doc-links.ts" },
    ],
    label: "docs",
  },
];

const CACHE_DIRECTORY = path.join(process.cwd(), ".cache", "check");
const useCache = !process.argv.includes("--no-cache");
const COLOR_GREEN = "\u001b[32m";
const COLOR_RED = "\u001b[31m";
const COLOR_RESET = "\u001b[0m";

function runStep(
  step: CheckStep,
  fingerprint: string,
): Promise<CheckExecutionResult & { cached: boolean; label: string }> {
  return runCachedCheck({
    cacheDirectory: CACHE_DIRECTORY,
    fingerprint,
    run: () =>
      new Promise<CheckExecutionResult>((resolve) => {
        const child = spawn(step.command, step.args, {
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        let settled = false;

        child.stdout.on("data", (chunk) => {
          output += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
          output += chunk.toString();
        });
        child.on("error", (error) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve({ ok: false, output: error.message });
        });
        child.on("close", (code) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve({ ok: code === 0, output });
        });
      }),
    task: step.label,
    useCache,
  }).then((result) => ({ ...result, label: step.label }));
}

const results = await Promise.all(
  steps.map((step) =>
    runStep(
      step,
      createCheckFingerprint(
        step.label,
        [step.command, ...step.args],
        step.inputs,
      ),
    ),
  ),
);

let fail = 0;
for (const { cached, label, ok, output } of results) {
  if (ok) {
    console.log(
      `  ${COLOR_GREEN}✓${COLOR_RESET} ${label}${cached ? " (cached)" : ""}`,
    );
  } else {
    console.log(`  ${COLOR_RED}✗${COLOR_RESET} ${label}`);
    if (output.trim()) {
      console.log(output.trimEnd());
    }
    fail = 1;
  }
}

if (fail) {
  process.exit(1);
}
