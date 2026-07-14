import { spawnSync } from "node:child_process";

const staged = spawnSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
  { encoding: "utf8" },
);

if (staged.status !== 0) {
  process.exit(staged.status ?? 1);
}

const files = staged.stdout.split(/\r?\n/).filter(Boolean);

const lintFiles = files.filter((file) => /\.[cm]?[jt]sx?$/.test(file));
const formatFiles = files.filter((file) =>
  /\.(?:[cm]?[jt]sx?|json|css|md|ya?ml)$/.test(file),
);

run(
  formatFiles.length
    ? [process.execPath, "x", "prettier", "--check", ...formatFiles]
    : [],
);
run(
  lintFiles.length
    ? [
        process.execPath,
        "x",
        "eslint",
        "--max-warnings=0",
        "--cache",
        "--cache-location",
        ".eslintcache",
        ...lintFiles,
      ]
    : [],
);

function run(command: string[]) {
  if (!command.length) {
    return;
  }

  const result = spawnSync(command[0], command.slice(1), {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
