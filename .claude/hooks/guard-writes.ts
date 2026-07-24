#!/usr/bin/env bun
// Claude Code PreToolUse hook: guard file writes.
//
// Reads the PreToolUse JSON payload from stdin. For Edit/Write/NotebookEdit
// tool calls, blocks writes to:
//   - platform-owned / generated-app paths (package.json, vite.config.ts,
//     components.json, generated-app.manifest.json) — mirrors the app's own
//     generated-build-policy; an unattended agent must not rewrite these.
//   - secret/credential files (.env*, _token*, _session_token*, auth.env)
//     — secret hygiene; never persist credentials. Localhost session
//     cookies (cookie.txt / cookie_local.txt) are intentionally NOT blocked:
//     they are low-stakes local-only test fixtures the operator stores
//     deliberately.
//   - the route tree (src/routeTree.gen.ts) — it is codegen'd by
//     `bun run routes:generate`, never hand-edited.
//
// Exit 2 = block. Stderr is shown to the agent as the block reason.
import { readFileSync } from "node:fs";

type PreToolUseInput = {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string; path?: string };
};

const PROTECTED_GLOBS = [
  "package.json",
  "vite.config.ts",
  "vite.config.mjs",
  "vite.config.js",
  "components.json",
  "generated-app.manifest.json",
  "src/routeTree.gen.ts",
  "postcss.config.mjs",
  "tailwind.config.ts",
];

const SECRET_PATTERNS = [
  /\.env(\..*)?$/i,
  /(^|\/)_token(\.txt)?$/i,
  /(^|\/)_session_token(\.txt)?$/i,
  /auth\.env$/i,
];

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function block(reason: string): never {
  process.stderr.write(`[guard-writes] BLOCKED: ${reason}\n`);
  process.exit(2);
}

function basename(target: string): string {
  const cleaned = target.replace(/\\/g, "/");
  const parts = cleaned.split("/");
  return parts[parts.length - 1] ?? cleaned;
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) {
    process.exit(0);
  }

  let payload: PreToolUseInput;
  try {
    payload = JSON.parse(raw) as PreToolUseInput;
  } catch {
    process.exit(0); // fail open on malformed payload
  }

  const tool = payload.tool_name ?? "";
  if (!["Edit", "Write", "NotebookEdit", "MultiEdit"].includes(tool)) {
    process.exit(0);
  }

  const target =
    payload.tool_input?.file_path ??
    payload.tool_input?.notebook_path ??
    payload.tool_input?.path ??
    "";

  if (!target) {
    process.exit(0);
  }

  const base = basename(target);

  if (PROTECTED_GLOBS.some((g) => base === g || base === g.replace(/\..*$/, ""))) {
    // Precise match: compare full basename to avoid blocking e.g.
    // `package.json.test.ts` — but the platform files above are exact.
  }

  if (PROTECTED_GLOBS.includes(base)) {
    block(`writing platform-owned / codegen path '${target}' is not allowed.`);
  }

  for (const re of SECRET_PATTERNS) {
    if (re.test(base) || re.test(target)) {
      block(`writing secret/credential path '${target}' is not allowed.`);
    }
  }

  process.exit(0);
}

main();
