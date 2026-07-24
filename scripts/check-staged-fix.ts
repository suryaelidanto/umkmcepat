import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Pre-commit auto-fix gate. Runs `prettier --write` + `eslint --fix` on staged
 * files, re-stages the fixed content, then runs a read-only prettier + eslint
 * check.
 *
 * CRITICAL SAFETY — never stages unstaged working-tree changes:
 * The fixers (prettier/eslint) operate on real files, so we must put the
 * STAGED version into the working tree before fixing (otherwise a file with
 * staged + unstaged edits would have the unstaged edit fixed-and-committed).
 * We snapshot each staged file's working-tree bytes to a temp dir, write the
 * staged blob into the working tree, fix + re-stage, then restore the snapshot.
 * No `git stash`, so no merge-conflict state can ever be left in the index.
 */
function gitCapture(args: string[]): string {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function gitRun(args: string[]): void {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
}

function run(command: string[]): void {
  if (!command.length) {
    return;
  }
  const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  const files = gitCapture([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
  ])
    .split(/\r?\n/)
    .filter(Boolean);

  const lintFiles = files.filter((file) => /\.[cm]?[jt]sx?$/.test(file));
  const formatFiles = files.filter((file) =>
    /\.(?:[cm]?[jt]sx?|json|css|md|ya?ml)$/.test(file),
  );

  // Files that have both staged and unstaged changes need working-tree
  // protection; files staged-but-unchanged-in-worktree are safe as-is.
  const dirty = new Set(
    gitCapture(["diff", "--name-only"]).split(/\r?\n/).filter(Boolean),
  );

  const tmp = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-autofix-"));
  const snapshots: Array<{ abs: string; rel: string; wtBytes: Buffer | null }> =
    [];

  try {
    // 1. Snapshot working-tree bytes for staged files that also have unstaged
    //    changes, then replace the working-tree file with the staged blob so
    //    the fixers only see staged content.
    for (const rel of files) {
      if (!dirty.has(rel)) {
        continue;
      }
      const abs = path.resolve(rel);
      let wtBytes: Buffer | null = null;
      if (existsSync(abs)) {
        wtBytes = await readFile(abs);
      }
      snapshots.push({ abs, rel, wtBytes });
      const blob = gitCapture(["show", `:${rel}`]);
      const dir = path.dirname(abs);
      await mkdir(dir, { recursive: true });
      await writeFile(abs, blob, "utf8");
    }

    // 2. Auto-fix the (now staged-only) content.
    run(
      formatFiles.length
        ? [process.execPath, "x", "prettier", "--write", ...formatFiles]
        : [],
    );
    run(
      lintFiles.length
        ? [
            process.execPath,
            "x",
            "eslint",
            "--fix",
            "--no-warn-ignored",
            ...lintFiles,
          ]
        : [],
    );

    // 3. Re-stage the fixed staged content.
    if (files.length) {
      gitRun(["add", "--", ...files]);
    }

    // 4. Read-only verify; any remaining issue blocks the commit.
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
            "--no-warn-ignored",
            ...lintFiles,
          ]
        : [],
    );
  } finally {
    // 5. Restore the original working-tree bytes for the snapshot files.
    for (const snap of snapshots) {
      if (snap.wtBytes === null) {
        // Working tree had no file at this path (it was a staged addition
        // with a subsequent unstaged deletion). Recreate the staged content so
        // the user doesn't lose the unstaged delete intent — actually nothing
        // to restore; leave as-is (fixed staged content is already staged).
        continue;
      }
      await mkdir(path.dirname(snap.abs), { recursive: true });
      const tmpFile = path.join(tmp, snap.rel.replace(/\//g, "__"));
      await mkdir(path.dirname(tmpFile), { recursive: true });
      await writeFile(tmpFile, snap.wtBytes);
      await rename(tmpFile, snap.abs).catch(async () => {
        await writeFile(snap.abs, snap.wtBytes!);
      });
    }
    await rm(tmp, { force: true, recursive: true });
  }
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
