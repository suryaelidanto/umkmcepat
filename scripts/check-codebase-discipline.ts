import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const ALLOWED_GENERATED = new Set(["src/routeTree.gen.ts"]);

const FORBIDDEN_DIRS = new Set([
  "hooks",
  "utils",
  "helpers",
  "misc",
  "temp",
  "tmp",
  "stuff",
]);

interface Violation {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

const violations: Violation[] = [];

function checkDirectoryNames(dir: string) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const name = entry.name;
    if (
      name.startsWith(".") ||
      name === "node_modules" ||
      name === "dist" ||
      name === ".output" ||
      name === ".nitro" ||
      name === "coverage"
    ) {
      continue;
    }
    const fullPath = path.join(dir, name);
    const relPath = path.relative(ROOT, fullPath);

    if (FORBIDDEN_DIRS.has(name.toLowerCase())) {
      violations.push({
        file: relPath,
        line: 1,
        rule: "forbidden-directory-name",
        detail: `Generic catch-all directory '${name}' is forbidden. Organize by feature/domain.`,
      });
    }

    checkDirectoryNames(fullPath);
  }
}

function checkCommentsAndTypes(filePath: string, content: string) {
  const relPath = path.relative(ROOT, filePath);
  if (ALLOWED_GENERATED.has(relPath)) {
    return;
  }

  const lines = content.split("\n");
  let consecutiveComments = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("//") && !trimmed.startsWith("///")) {
      consecutiveComments++;
      if (consecutiveComments > 1) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: "no-multiline-comments",
          detail:
            "Multi-line comments are forbidden. Keep comments to a single concise line.",
        });
      }
    } else {
      consecutiveComments = 0;
    }

    if (
      relPath.startsWith("src/routes/") &&
      (trimmed.includes('Hello "/_main') ||
        trimmed.includes('Hello "/admin') ||
        trimmed.includes('Hello "/support'))
    ) {
      if (
        !relPath.includes("settings.page.test") &&
        !relPath.includes("check-codebase-discipline")
      ) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: "no-dummy-stub-route",
          detail:
            "TanStack Router default placeholder detected. Write the actual page component instead of placeholder.",
        });
      }
    }

    if (
      trimmed.includes("@ts" + "-ignore") &&
      !relPath.includes("check-codebase-discipline")
    ) {
      violations.push({
        file: relPath,
        line: lineNum,
        rule: "no-ts-ignore",
        detail:
          "@ts-ignore is forbidden. Fix the type error or narrow properly.",
      });
    }

    if (
      trimmed.includes("eslint" + "-disable") &&
      !relPath.includes("check-codebase-discipline")
    ) {
      violations.push({
        file: relPath,
        line: lineNum,
        rule: "no-eslint-disable",
        detail:
          "eslint-disable is forbidden. Fix the root cause or adjust eslint.config.js.",
      });
    }

    if (trimmed.startsWith("//") && !trimmed.startsWith("///")) {
      const commentText = trimmed.replace(/^\/\/\s*/, "");
      if (/^[-=]{3,}$/.test(commentText)) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: "no-comment-banners",
          detail: "ASCII banner dividers (// ---) are forbidden.",
        });
      }
    }
  }
}

function getAllFiles(dir: string): string[] {
  const result: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (
      entry.name.startsWith(".") ||
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".output" ||
      entry.name === ".nitro" ||
      entry.name === "coverage"
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      result.push(...getAllFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      result.push(fullPath);
    }
  }
  return result;
}

export function runDisciplineCheck(): Violation[] {
  violations.length = 0;

  checkDirectoryNames(path.join(ROOT, "src"));
  checkDirectoryNames(path.join(ROOT, "tests"));
  checkDirectoryNames(path.join(ROOT, "scripts"));

  const files = [
    ...getAllFiles(path.join(ROOT, "src")),
    ...getAllFiles(path.join(ROOT, "tests")),
    ...getAllFiles(path.join(ROOT, "scripts")),
  ];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    checkCommentsAndTypes(file, content);
  }

  return violations;
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  (import.meta as { main?: boolean }).main
) {
  const results = runDisciplineCheck();
  if (results.length === 0) {
    console.log("✓ Codebase discipline check passed");
    process.exit(0);
  }

  console.error(
    `✗ Codebase discipline check failed with ${results.length} violations:\n`,
  );
  for (const v of results) {
    console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.detail}`);
  }
  process.exit(1);
}
