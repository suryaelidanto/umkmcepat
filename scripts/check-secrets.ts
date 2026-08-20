import { spawnSync } from "node:child_process";

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "AWS access key ID", pattern: /AKIA[0-9A-Z]{16}/ },
  {
    name: "private key block",
    pattern: /-----BEGIN[ A-Z]*PRIVATE KEY-----/,
  },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: "Slack token", pattern: /xox[baprs]-[0-9A-Za-z-]+/ },
  { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "Stripe live key", pattern: /sk_live_[0-9a-zA-Z]{20,}/ },
  {
    name: "JWT",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
];

function gitCapture(args: string[]): string {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function main(): void {
  const files = gitCapture([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
  ])
    .split(/\r?\n/)
    .filter(Boolean);

  const violations: string[] = [];

  for (const file of files) {
    const content = spawnSync("git", ["show", `:${file}`], {
      encoding: "utf8",
    }).stdout;
    if (!content) {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const { name, pattern } of SECRET_PATTERNS) {
        if (pattern.test(lines[i])) {
          violations.push(`${file}:${i + 1} — looks like a ${name}`);
        }
      }
    }
  }

  if (violations.length) {
    process.stderr.write("Possible secret(s) in staged changes:\n");
    for (const violation of violations) {
      process.stderr.write(`  ${violation}\n`);
    }
    process.stderr.write(
      "\nIf this is a false positive, rewrite the line so it doesn't match a real secret shape.\n" +
        "Never commit real secrets — see AGENTS.md's secrets rules.\n",
    );
    process.exit(1);
  }
}

main();
