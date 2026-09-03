#!/usr/bin/env bun
/**
 * scripts/db-guard.ts
 *
 * Hard guard preventing any accidental database destructive operations (such as
 * prisma migrate reset, prisma db push --force-reset, dropping production DBs).
 */

const args = process.argv.slice(2);
const commandString = args.join(" ").toLowerCase();

const FORBIDDEN_PATTERNS = [
  /\bmigrate\s+reset\b/iu,
  /--force-reset/iu,
  /\bdb\s+drop\b/iu,
  /\bdrop\s+database\b/iu,
  /\btruncate\b/iu,
];

for (const pattern of FORBIDDEN_PATTERNS) {
  if (pattern.test(commandString)) {
    console.error("\n🛑 [CRITICAL DATABASE SAFETY GUARD]");
    console.error(
      `Destructive database operation detected and PERMANENTLY BLOCKED: "${commandString}"`,
    );
    console.error(
      "Database resets are strictly forbidden to prevent data loss.",
    );
    console.error(
      "Use 'bun run db:migrate' (prisma migrate deploy) for safe forward-only schema migrations.\n",
    );
    process.exit(1);
  }
}

// Allow safe command execution
import { spawn } from "node:child_process";

const child = spawn("bunx", ["prisma", ...args], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
