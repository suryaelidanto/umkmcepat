#!/usr/bin/env bun
// Claude Code PreToolUse hook: guard git push.
//
// Reads the PreToolUse JSON payload from stdin (tool_name, tool_input).
// For Bash tool calls, inspects the command string. Blocks any `git push`
// whose refspec targets main/master (the never-push-to-main rail), while
// allowing pushes to dev (the sanctioned /push-dev path).
//
// Exit 2 = block the tool call (Claude Code convention). Stderr is shown
// to the agent as the block reason.
import { readFileSync } from "node:fs";

type PreToolUseInput = {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { command?: string };
};

const PROTECTED_REFS = ["main", "master"];

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function block(reason: string): never {
  process.stderr.write(`[guard-push] BLOCKED: ${reason}\n`);
  process.exit(2);
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
    // Malformed payload: never block — fail open so a hook bug can't brick
    // the session. Claude Code still enforces permission rules separately.
    process.exit(0);
  }

  if (payload.tool_name !== "Bash") {
    process.exit(0);
  }

  const command = payload.tool_input?.command ?? "";
  if (!command) {
    process.exit(0);
  }

  // Only scrutinize git push. Everything else passes to permission rules.
  if (!/\bgit\b.*\bpush\b/.test(command)) {
    process.exit(0);
  }

  // Force-push / delete refspec: block outright (too destructive unattended).
  if (/(--force|-f)\b/.test(command) && /git\b.*\bpush\b/.test(command)) {
    block("force-push is not allowed for unattended iteration.");
  }

  // No explicit refspec (e.g. `git push` with push.default): allow only if
  // the current branch resolves to a safe ref. We cannot see HEAD from here,
  // so require an explicit dev refspec; a bare `git push` is blocked to be
  // safe — the sanctioned path is `git push origin dev`.
  const refspecMatch = command.match(/git\b.*\bpush\b\s+\S+\s+(\S+)/);
  if (!refspecMatch) {
    block(
      "bare `git push` without an explicit dev refspec is not allowed; use `git push origin dev`.",
    );
  }

  const refspec = refspecMatch[1] ?? "";
  // Allow `dev`, `origin/dev`, `HEAD:dev`. Block anything touching main/master.
  const targetsProtected = PROTECTED_REFS.some(
    (ref) => refspec === ref || refspec.endsWith(`/${ref}`) || refspec.includes(`:${ref}`) || refspec === `${ref}`,
  );

  if (targetsProtected) {
    block(`git push to protected branch '${refspec}' is not allowed.`);
  }

  process.exit(0);
}

main();
