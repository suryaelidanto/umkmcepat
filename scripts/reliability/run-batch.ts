/**
 * Batch create+build reliability runs (real AI — burns energy).
 * Requires RELIABILITY_COOKIE and a running app with infra.
 *
 * Usage:
 *   bun run scripts/reliability/run-batch.ts --count 5 --batch 1
 */
import {
  emptyReport,
  finalizeReport,
  writeReport,
  type ReliabilityCaseResult,
} from "./lib/report";

const baseUrl = (
  process.env.RELIABILITY_BASE_URL ?? "http://127.0.0.1:3000"
).replace(/\/$/, "");
const cookie = process.env.RELIABILITY_COOKIE ?? "";

function arg(name: string, fallback: string) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

async function runOne(index: number): Promise<ReliabilityCaseResult> {
  const started = Date.now();
  const id = `batch-${index}`;
  if (!cookie) {
    return {
      id,
      ok: false,
      detail: "RELIABILITY_COOKIE unset — skip real create",
      ms: Date.now() - started,
    };
  }

  const prompt = `Website company profile batch reliability #${index}`;
  const created = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
  if (created.status >= 400) {
    return {
      id,
      ok: false,
      detail: `create status=${created.status} ${JSON.stringify(created.json).slice(0, 200)}`,
      ms: Date.now() - started,
    };
  }

  const projectId =
    (created.json as { id?: string; projectId?: string })?.id ??
    (created.json as { projectId?: string })?.projectId;
  if (!projectId) {
    return {
      id,
      ok: false,
      detail: `create missing id: ${JSON.stringify(created.json).slice(0, 200)}`,
      ms: Date.now() - started,
    };
  }

  // Poll runtime a few times (discuss/build may be separate UX; this checks API health)
  let lastStatus = "";
  for (let i = 0; i < 5; i++) {
    const runtime = await api(`/api/projects/${projectId}/runtime`);
    lastStatus = `${runtime.status}:${JSON.stringify(runtime.json).slice(0, 120)}`;
    if (runtime.status < 500) {
      return {
        id: projectId,
        ok: true,
        detail: `created+runtime ok (${lastStatus})`,
        ms: Date.now() - started,
      };
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return {
    id: projectId,
    ok: false,
    detail: `runtime unhealthy ${lastStatus}`,
    ms: Date.now() - started,
  };
}

async function main() {
  const count = Number(arg("count", "1"));
  const batch = Number(arg("batch", "1"));
  const report = emptyReport("run-batch");
  const results: ReliabilityCaseResult[] = [];

  for (let i = 0; i < count; i += batch) {
    const slice = Array.from(
      { length: Math.min(batch, count - i) },
      (_, j) => i + j,
    );
    const chunk = await Promise.all(slice.map((n) => runOne(n)));
    results.push(...chunk);
    process.stdout.write(
      `batch ${i}-${i + chunk.length - 1}: ${chunk.filter((c) => c.ok).length}/${chunk.length} ok\n`,
    );
  }

  report.results = results;
  const final = finalizeReport(report);
  const path = writeReport(final, "batch-report.json");
  process.stdout.write(`${JSON.stringify(final.summary, null, 2)}\n`);
  process.stdout.write(`wrote ${path}\n`);
  if (final.summary.fail > 0 && cookie) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
