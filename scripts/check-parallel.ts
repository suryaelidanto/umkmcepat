// Run the fast pre-commit gate checks in parallel.
// Each step has its own cache; the slowest one wins.

/* eslint-disable no-console */
import { spawn } from "node:child_process";

const steps: Array<[label: string, cmd: string, args: string[]]> = [
  ["format", "bun", ["run", "format:check"]],
  ["lint", "bun", ["run", "lint"]],
  ["typecheck", "bun", ["run", "typecheck"]],
  ["test", "bun", ["run", "test:changed"]],
  ["knip", "bun", ["run", "knip"]],
];

const COLOR_GREEN = "[32m";
const COLOR_RED = "[31m";
const COLOR_RESET = "[0m";

const runStep = (label: string, cmd: string, args: string[]) =>
  new Promise<{ label: string; ok: boolean; output: string }>((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ label, ok: code === 0, output });
    });
  });

const results = await Promise.all(
  steps.map(([label, cmd, args]) => runStep(label, cmd, args)),
);

let fail = 0;
for (const { label, ok, output } of results) {
  if (ok) {
    console.log(`  ${COLOR_GREEN}✓${COLOR_RESET} ${label}`);
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
