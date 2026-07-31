/**
 * Simulate ~100 concurrent product users against a running server.
 * Uses one session cookie when set; unauthenticated GETs still exercise load paths.
 *
 * Usage: RELIABILITY_BASE_URL=http://127.0.0.1:3000 bun run scripts/reliability/stress-100.ts
 */
import {
  emptyReport,
  finalizeReport,
  writeReport,
  type ReliabilityCaseResult,
} from "./lib/report";

const baseUrl = (
  process.env.RELIABILITY_BASE_URL ?? "https://dev.umkmcepat.com"
).replace(/\/$/, "");
const cookie = process.env.RELIABILITY_COOKIE ?? "";
const origin = process.env.RELIABILITY_ORIGIN ?? baseUrl;

async function fetchPath(
  path: string,
): Promise<{ status: number; ms: number }> {
  const started = Date.now();
  let status = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: {
          ...(cookie ? { cookie } : {}),
          origin,
          referer: `${origin}/`,
        },
      });
      status = res.status;
      // Cloudflare tunnel blips
      if (status === 520 || status === 522 || status === 524) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      break;
    } catch {
      status = 0;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return { status, ms: Date.now() - started };
}

async function main() {
  const report = emptyReport("stress-100");
  const results: ReliabilityCaseResult[] = [];

  // Home + health-ish paths (always)
  const warm = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      fetchPath("/").then((r) => ({
        id: `home-${i}`,
        ok: r.status < 500,
        detail: `status=${r.status}`,
        ms: r.ms,
      })),
    ),
  );
  results.push(...warm);

  // Concurrent project list / API surface (auth optional)
  const lists = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      fetchPath("/api/projects").then((r) => ({
        id: `projects-list-${i}`,
        ok: r.status === 200 || r.status === 401,
        detail: `status=${r.status}`,
        ms: r.ms,
      })),
    ),
  );
  results.push(...lists);

  // Burst of runtime GETs for a fake id (404/401 ok; 5xx not)
  const runtimes = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      fetchPath(`/api/projects/stress-probe-${i % 5}/runtime`).then((r) => ({
        id: `runtime-${i}`,
        ok: r.status < 500,
        detail: `status=${r.status}`,
        ms: r.ms,
      })),
    ),
  );
  results.push(...runtimes);

  report.results = results;
  const final = finalizeReport(report);
  const path = writeReport(final, "stress-100-report.json");
  process.stdout.write(`${JSON.stringify(final.summary, null, 2)}\n`);
  process.stdout.write(`wrote ${path}\n`);
  if (final.summary.fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
