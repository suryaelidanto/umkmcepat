#!/usr/bin/env bun
/* eslint-disable no-console */
/**
 * Sync .env to .env.example structure WITHOUT touching your secret values.
 *
 * - Keys present in .env.example but missing from .env  -> added with the
 *   example's default value (you fill real secrets after).
 * - Keys in .env but not in .env.example                  -> removed (obsolete).
 * - Keys in both                                         -> your .env value is kept verbatim.
 * - Comments + ordering match .env.example.
 * - .env.bak backup is written before any change.
 *
 * Run: bun run sync:env
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXAMPLE = path.join(ROOT, ".env.example");
const ENV = path.join(ROOT, ".env");
const BACKUP = `${ENV}.bak`;

if (!existsSync(EXAMPLE)) {
  console.error(".env.example not found — run from the repo root.");
  process.exit(1);
}
if (!existsSync(ENV)) {
  console.error(".env not found — copy .env.example to .env first.");
  process.exit(1);
}

copyFileSync(ENV, BACKUP);
console.log(`backup: ${BACKUP}`);

// Parse a .env file into ordered [line] preserving comments/blanks, plus a
// map of KEY -> raw value (without the surrounding quotes stripped).
function parse(file: string) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const values = new Map<string, string>();
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      values.set(m[1], m[2]);
    }
  }
  return { lines, values };
}

const ex = parse(EXAMPLE);
const cur = parse(ENV);

let added = 0;
let removed = 0;
let kept = 0;

// Rebuild .env following .env.example's line order + comments. For each KEY=
// line in the example, use the CURRENT .env value if it exists (preserve
// secrets), otherwise the example's default. Drop .env-only keys (obsolete).
const out: string[] = [];
for (const line of ex.lines) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m) {
    // comment or blank — copy as-is.
    out.push(line);
    continue;
  }
  const key = m[1];
  if (cur.values.has(key)) {
    out.push(`${key}=${cur.values.get(key)}`);
    kept += 1;
  } else {
    out.push(`${key}=${m[2]}`);
    added += 1;
    console.log(
      `  + ${key} (added with example default — fill if it's a secret)`,
    );
  }
}

// Report obsolete keys that were dropped (not in .env.example).
for (const key of cur.values.keys()) {
  if (!ex.values.has(key)) {
    removed += 1;
    console.log(`  - ${key} (removed — not in .env.example)`);
  }
}

writeFileSync(ENV, `${out.join("\n")}\n`);
console.log(
  `\n synced .env → ${added} added, ${kept} kept, ${removed} removed. ` +
    `Backup at ${BACKUP}.`,
);
