import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TARGETS = ["src"];
const EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const ALLOWLIST = [
  "src/app/globals.css",
  "src/lib/ai.ts",
  "src/app/api/landing/route.ts",
  "src/app/(public)/p/[slug]/LandingPageDisplay.tsx",
  "src/app/(main)/logo-lab/page.tsx",
  "src/app/sentry-example-page/page.tsx",
];

const forbidden = [
  { name: "old orange CTA", pattern: /#ff5a3d|#e6452d/i },
  { name: "old off-white hardcode", pattern: /#f7f7f3/i },
  { name: "old hardcoded near-black", pattern: /#111111/i },
  { name: "legacy shadcn oklch", pattern: /oklch\(/i },
  { name: "legacy heavy shadow", pattern: /shadow-(md|lg|xl|2xl|inner)\b/ },
  { name: "legacy primary class in product UI", pattern: /\b(bg|text|border)-primary\b|focus:ring-primary\b/ },
  { name: "legacy rounded token", pattern: /\brounded-(md|lg)\b/ },
];

function isAllowed(path) {
  return ALLOWLIST.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

function ext(path) {
  const match = path.match(/\.[^.]+$/);
  return match?.[0] || "";
}

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collect(full, out);
      continue;
    }
    if (EXTENSIONS.has(ext(full))) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];

for (const target of TARGETS) {
  for (const file of collect(join(ROOT, target))) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (isAllowed(rel)) {
      continue;
    }
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const rule of forbidden) {
        if (rule.pattern.test(line)) {
          failures.push(`${rel}:${index + 1} ${rule.name}: ${line.trim()}`);
        }
      }
    });
  }
}

if (failures.length > 0) {
  console.error("Design-system drift detected:\n");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.warn("Design-system drift check passed.");
