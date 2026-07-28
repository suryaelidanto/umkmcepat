import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Root-level canonical docs only. docs/superpowers/{specs,plans} are an
 * intentional decision trail and may reference removed files by design
 * (see docs/superpowers/plans/2026-07-25-final-docs-sync.md) — checking
 * them here would fight that policy instead of catching real drift.
 */
const repoRoot = process.cwd();
const mdFiles = readdirSync(repoRoot).filter((file) => file.endsWith(".md"));

const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

const violations: string[] = [];

for (const file of mdFiles) {
  const content = readFileSync(path.join(repoRoot, file), "utf8");
  for (const match of content.matchAll(linkPattern)) {
    const target = match[1].split("#")[0].trim();
    if (
      !target ||
      /^[a-z]+:\/\//i.test(target) ||
      target.startsWith("mailto:")
    ) {
      continue;
    }
    const resolved = path.resolve(repoRoot, target);
    if (!existsSync(resolved)) {
      violations.push(`${file} -> ${target}`);
    }
  }
}

if (violations.length) {
  process.stderr.write("Broken local links in root docs:\n");
  for (const violation of violations) {
    process.stderr.write(`  ${violation}\n`);
  }
  process.stderr.write(
    "\nFix the link or remove it — a canonical doc pointing at a deleted file is worse than no pointer.\n",
  );
  process.exit(1);
}
