#!/usr/bin/env bun
// Claude Code Stop hook: require a green `bun run check` before the agent
// may finish.
//
// Runs the project's fast manual gate (parallel format/lint/typecheck/
// test:changed/Knip) in the repo root. If it fails, exit 2 to block the
// Stop — the agent must fix the breakage before finishing. This is the
// "tests pass or auto-revert" rail: I cannot end a turn on a red tree.
//
// To avoid re-running the whole suite on every Stop during fast iteration,
// the gate only fires when the working tree has uncommitted changes to
// source files (git diff). A clean tree (already committed/verified) or
// a docs-only change lets the Stop pass cheaply.
import { spawnSync } from "node:child_process";

function hasSourceChanges(): boolean {
  const result = spawnSync("git", ["diff", "--name-only", "--cached", "--", "src/", "tests/", ".claude/"], {
    encoding: "utf8",
  });
  const staged = (result.stdout ?? "").trim();
  if (staged) {
    return true;
  }
  const unstaged = spawnSync("git", ["diff", "--name-only", "--", "src/", "tests/", ".claude/"], {
    encoding: "utf8",
  });
  return Boolean((unstaged.stdout ?? "").trim());
}

function block(reason: string): never {
  process.stderr.write(`[gate-check] BLOCKED stop: ${reason}\n`);
  process.exit(2);
}

function main() {
  if (!hasSourceChanges()) {
    // Nothing under guard changed — let the turn end without burning a
    // full check run.
    process.exit(0);
  }

  const result = spawnSync("bun", ["run", "check"], {
    cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    encoding: "utf8",
    timeout: 300_000,
  });

  if (result.status !== 0) {
    const tail = (result.stdout ?? "") + "\n" + (result.stderr ?? "");
    const trimmed = tail.length > 3000 ? `\n...${tail.slice(-3000)}` : `\n${tail}`;
    block(`bun run check failed.${trimmed}`);
  }

  process.exit(0);
}

main();
