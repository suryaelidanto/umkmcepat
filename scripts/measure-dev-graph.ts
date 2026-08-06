/* eslint-disable no-console */
/**
 * Dev-only: crawl the Vite module graph reachable from the TanStack Start dev
 * client entry and print counts, total size, and top offenders by size.
 *
 * Requires the dev server (bun run dev) on port 3000.
 *
 * Run: bun scripts/measure-dev-graph.ts
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

type ModuleStat = { url: string; ms: number; size: number };

const seen = new Set<string>();
const queue: string[] = [];
const stats: ModuleStat[] = [];
let errors = 0;

function resolvePath(from: string, spec: string): string | null {
  if (
    spec.startsWith("/@id/") ||
    spec.startsWith("/@fs/") ||
    spec.startsWith("/src/") ||
    spec.startsWith("/@vite/") ||
    spec.startsWith("/node_modules/")
  ) {
    return spec;
  }
  if (spec.startsWith("/")) {
    return spec;
  }
  if (spec.startsWith("virtual:")) {
    return "/@id/" + spec;
  }
  if (!spec.startsWith(".")) {
    return null;
  }
  const url = new URL(spec, `${BASE_URL}/${from.replace(/^\/+/, "")}`);
  return `${url.pathname}${url.search}`;
}

async function visit(url: string): Promise<void> {
  if (seen.has(url)) {
    return;
  }
  seen.add(url);
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}${url}`).catch(() => null);
  const elapsedMs = Date.now() - startedAt;
  if (!response || !response.ok) {
    errors += 1;
    return;
  }
  const text = await response.text();
  stats.push({ url, ms: elapsedMs, size: text.length });
  // Follow static imports everywhere; additionally follow the `await
  // import(...)` bootstrap in the virtual dev entry (it loads the client
  // graph at startup). Other dynamic imports are code-split chunks loaded on
  // demand, so they are not part of the initial page load.
  const isDevEntry = url.includes("dev-client-entry");
  const importPattern = isDevEntry
    ? /(?:from\s+|await\s+import\s*\(\s*)[\"']([^\"']+)[\"']/g
    : /from\s+[\"']([^\"']+)[\"']/g;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(text))) {
    const resolved = resolvePath(url, match[1]);
    if (resolved && !seen.has(resolved)) {
      queue.push(resolved);
    }
  }
}

async function main() {
  queue.push("/@id/virtual:tanstack-start-dev-client-entry");
  while (queue.length > 0 && seen.size < 2000) {
    const batch = queue.splice(0, 30);
    await Promise.all(batch.map(visit));
  }

  const totalBytes = stats.reduce((sum, item) => sum + item.size, 0);
  const totalMs = stats.reduce((sum, item) => sum + item.ms, 0);
  const sortedBySize = [...stats].sort((a, b) => b.size - a.size);

  console.log(`modules: ${seen.size} (errors: ${errors})`);
  console.log(
    `total JS/CSS bytes: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
  );
  console.log(
    `sequential fetch sum: ${(totalMs / 1000).toFixed(1)} s (browser ~6-parallel: ${(totalMs / 6 / 1000).toFixed(1)} s)`,
  );
  console.log("top 10 by size:");
  for (const item of sortedBySize.slice(0, 10)) {
    console.log(
      `  ${String(Math.round(item.size / 1024)).padStart(5)} KB  ${item.url}`,
    );
  }
}

main().catch((error) => {
  console.error("measure-dev-graph failed:", error);
  process.exit(1);
});
