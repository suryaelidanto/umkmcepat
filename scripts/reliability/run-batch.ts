/**
 * Batch create+brief+generate reliability runs (real AI — burns energy).
 * Requires RELIABILITY_COOKIE (header string) and reachable app + infra + Prisma.
 *
 * Usage:
 *   RELIABILITY_BASE_URL=https://dev.umkmcepat.com \
 *   RELIABILITY_COOKIE="$(cat cookie.header.txt)" \
 *   bun run scripts/reliability/run-batch.ts --count 5 --batch 1
 *
 * Flags:
 *   --count N     projects to run (default 1)
 *   --batch N     parallel creates (default 1)
 *   --timeout-ms  poll budget per project (default 600000)
 *   --chaos       after ready: retry_build once (optional stress)
 */
import { PrismaClient } from "@prisma/client";

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

const prisma = new PrismaClient();

function arg(name: string, fallback: string) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function headers(extra?: HeadersInit): HeadersInit {
  return {
    ...(cookie ? { cookie } : {}),
    origin,
    referer: `${origin}/`,
    ...(extra ?? {}),
  };
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: headers(init?.headers),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json, text };
}

/** Start generate without hanging on SSE. Reads JSON errors; cancels stream on 2xx. */
async function startGenerate(
  projectId: string,
  mode: "first_generate" | "retry_build",
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/generate`, {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({ mode }),
  });
  const ct = res.headers.get("content-type") ?? "";
  if (res.status >= 400 || ct.includes("application/json")) {
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: res.status, json };
  }
  try {
    await res.body?.cancel();
  } catch {
    /* ignore */
  }
  return { status: res.status, json: null };
}

async function startGenerateWithRateLimit(
  projectId: string,
  mode: "first_generate" | "retry_build",
): Promise<{ status: number; json: unknown }> {
  let gen = await startGenerate(projectId, mode);
  if (gen.status === 429) {
    const retryAfter =
      Number((gen.json as { retryAfter?: number })?.retryAfter) || 60;
    const sleepSec = Math.min(Math.max(retryAfter, 5), 1200);
    process.stdout.write(
      `  rate_limited project=${projectId} sleep ${sleepSec}s\n`,
    );
    await new Promise((r) => setTimeout(r, sleepSec * 1000));
    gen = await startGenerate(projectId, mode);
  }
  return gen;
}

function briefFor(index: number, prompt: string) {
  return {
    version: 1,
    prompt,
    businessName: `Batch Usaha ${index}`,
    businessType: "fnb",
    offer: "Produk dan layanan lokal",
    confidence: 95,
    readyForBuild: true,
    contactOrCta: "WhatsApp",
    targetCustomer: "warga sekitar",
    productOrService: [{ name: "Produk unggulan", isPrimary: true }],
    paymentMethods: ["qris", "cash"],
    facts: [],
    notes: [],
    decisions: [],
    openQuestions: [],
  };
}

async function setBrief(projectId: string, brief: unknown) {
  await prisma.$executeRaw`
    UPDATE "Project" SET "brief" = ${JSON.stringify(brief)}::jsonb WHERE "id" = ${projectId}
  `;
}

type RuntimeBody = {
  canPreview?: boolean;
  canPublish?: boolean;
  canRetry?: boolean;
  hasPersistedSource?: boolean;
  userFacingState?: string;
  build?: { status?: string } | null;
  activeJob?: { phase?: string; message?: string } | null;
};

async function pollRuntime(
  projectId: string,
  timeoutMs: number,
): Promise<{ ok: boolean; detail: string; body?: RuntimeBody }> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const runtime = await api(`/api/projects/${projectId}/runtime`);
    const body = (runtime.json ?? {}) as RuntimeBody;
    last = `${runtime.status}:${body.userFacingState ?? "?"}:preview=${body.canPreview}:source=${body.hasPersistedSource}:job=${body.activeJob?.phase ?? "-"}`;

    if (runtime.status === 401 || runtime.status === 403) {
      return { ok: false, detail: `auth ${last}`, body };
    }

    if (
      body.canPreview === true ||
      body.userFacingState === "ready" ||
      body.userFacingState === "ready_with_failed_latest_attempt"
    ) {
      return {
        ok: body.canPreview === true || body.hasPersistedSource === true,
        detail: last,
        body,
      };
    }

    const failedState =
      body.userFacingState === "failed" ||
      body.userFacingState === "build_failed_without_last_good" ||
      body.build?.status === "failed" ||
      (body.canRetry === true &&
        !body.activeJob &&
        body.canPreview === false &&
        body.userFacingState !== "building" &&
        body.userFacingState !== "queued");
    if (failedState && !body.activeJob) {
      return { ok: false, detail: `failed ${last}`, body };
    }

    await new Promise((r) => setTimeout(r, 3000));
  }
  const lastRuntime = await api(`/api/projects/${projectId}/runtime`);
  return {
    ok: false,
    detail: `timeout ${last}`,
    body: (lastRuntime.json ?? {}) as RuntimeBody,
  };
}

async function runOne(index: number): Promise<ReliabilityCaseResult> {
  const started = Date.now();
  const id = `batch-${index}`;
  const timeoutMs = Number(arg("timeout-ms", "900000"));
  const chaos = hasFlag("chaos");

  if (!cookie) {
    return {
      id,
      ok: false,
      detail: "RELIABILITY_COOKIE unset",
      ms: Date.now() - started,
    };
  }

  const prompt = `Website company profile batch reliability #${index} warung kopi lokal`;
  const form = new FormData();
  form.set("prompt", prompt);
  form.set("mode", "discuss");
  form.set("idempotencyKey", `rel-batch-${Date.now()}-${index}`);

  const created = await api("/api/projects", { method: "POST", body: form });
  if (created.status >= 400) {
    return {
      id,
      ok: false,
      detail: `create status=${created.status} ${JSON.stringify(created.json).slice(0, 200)}`,
      ms: Date.now() - started,
    };
  }

  const projectId = (created.json as { id?: string })?.id;
  if (!projectId) {
    return {
      id,
      ok: false,
      detail: `create missing id: ${JSON.stringify(created.json).slice(0, 200)}`,
      ms: Date.now() - started,
    };
  }

  try {
    await setBrief(projectId, briefFor(index, prompt));
  } catch (error) {
    return {
      id: projectId,
      ok: false,
      detail: `brief ${error instanceof Error ? error.message : String(error)}`,
      ms: Date.now() - started,
    };
  }

  const gen = await startGenerateWithRateLimit(projectId, "first_generate");
  if (gen.status >= 400 && gen.status !== 409) {
    return {
      id: projectId,
      ok: false,
      detail: `generate status=${gen.status} ${JSON.stringify(gen.json).slice(0, 160)}`,
      ms: Date.now() - started,
    };
  }

  let first = await pollRuntime(projectId, timeoutMs);
  // Timeout while still building: extend once — do NOT claim a second lease.
  if (
    !first.ok &&
    first.detail.startsWith("timeout") &&
    first.body?.activeJob
  ) {
    first = await pollRuntime(projectId, timeoutMs);
  }
  if (!first.ok) {
    // Only retry when job is idle (failed terminal). Never supersede an active lease.
    if (first.body?.activeJob) {
      return {
        id: projectId,
        ok: false,
        detail: `still-running ${first.detail}`,
        ms: Date.now() - started,
      };
    }
    const retry = await startGenerateWithRateLimit(projectId, "retry_build");
    if (retry.status < 400 || retry.status === 409) {
      const second = await pollRuntime(projectId, timeoutMs);
      return {
        id: projectId,
        ok: second.ok,
        detail: `retry after [${first.detail}] → ${second.detail}`,
        ms: Date.now() - started,
      };
    }
    return {
      id: projectId,
      ok: false,
      detail: first.detail,
      ms: Date.now() - started,
    };
  }

  if (chaos) {
    const chaosGen = await startGenerateWithRateLimit(projectId, "retry_build");
    if (chaosGen.status < 400 || chaosGen.status === 409) {
      const after = await pollRuntime(projectId, Math.min(timeoutMs, 300_000));
      return {
        id: projectId,
        ok: after.ok || first.ok,
        detail: `ready+chaos ${first.detail} → ${after.detail}`,
        ms: Date.now() - started,
      };
    }
  }

  return {
    id: projectId,
    ok: true,
    detail: first.detail,
    ms: Date.now() - started,
  };
}

async function main() {
  const count = Number(arg("count", "1"));
  const batch = Number(arg("batch", "1"));
  const report = emptyReport("run-batch");
  const results: ReliabilityCaseResult[] = [];

  process.stdout.write(
    `run-batch base=${baseUrl} count=${count} batch=${batch} cookie=${cookie ? "set" : "unset"}\n`,
  );

  for (let i = 0; i < count; i += batch) {
    const slice = Array.from(
      { length: Math.min(batch, count - i) },
      (_, j) => i + j,
    );
    const chunk = await Promise.all(slice.map((n) => runOne(n)));
    results.push(...chunk);
    for (const c of chunk) {
      process.stdout.write(
        `  ${c.ok ? "PASS" : "FAIL"} ${c.id} ${c.ms ?? 0}ms ${c.detail ?? ""}\n`,
      );
    }
    process.stdout.write(
      `batch ${i}-${i + chunk.length - 1}: ${chunk.filter((c) => c.ok).length}/${chunk.length} ok\n`,
    );
    // space builds to avoid build rate limit (one account)
    if (i + batch < count) {
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }

  report.results = results;
  const final = finalizeReport(report);
  const path = writeReport(final, "batch-report.json");
  process.stdout.write(`${JSON.stringify(final.summary, null, 2)}\n`);
  process.stdout.write(`wrote ${path}\n`);
  await prisma.$disconnect();
  if (final.summary.fail > 0 && cookie) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
