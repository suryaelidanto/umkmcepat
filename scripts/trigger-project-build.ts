import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { encode } from "@auth/core/jwt";

import { authConfig } from "@/lib/auth/auth-config";
import { prisma } from "@/lib/prisma";

export const STREAM_TIMEOUT_MIN_MS = 30_000;
export const STREAM_TIMEOUT_MAX_MS = 30 * 60_000;
const DEFAULT_STREAM_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_BASE_URL = "http://localhost:3000";

type BuildTriggerEnvironment = Readonly<Record<string, string | undefined>>;

export type BuildTriggerConfig = {
  baseUrl: string;
  handoffId?: string;
  mode: "first_generate" | "retry_build";
  projectId: string;
  reviewHash?: string;
  streamTimeoutMs: number;
};

type ResolvedBuildIdentity = {
  cookie: string;
  handoffId: string;
  localDatabase: boolean;
  reviewHash: string;
};

function valueFrom(
  env: BuildTriggerEnvironment,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function parseBaseUrl(value: string | undefined): string {
  const raw = value || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("BASE_URL must be an absolute http(s) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BASE_URL must use http or https.");
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

function parseStreamTimeout(value: string | undefined): number {
  const parsed = value ? Number(value) : DEFAULT_STREAM_TIMEOUT_MS;
  if (
    !Number.isInteger(parsed) ||
    parsed < STREAM_TIMEOUT_MIN_MS ||
    parsed > STREAM_TIMEOUT_MAX_MS
  ) {
    throw new Error(
      `BUILD_STREAM_TIMEOUT_MS must be an integer from ${STREAM_TIMEOUT_MIN_MS} to ${STREAM_TIMEOUT_MAX_MS}.`,
    );
  }
  return parsed;
}

export function readBuildTriggerConfig(
  env: BuildTriggerEnvironment = process.env,
): BuildTriggerConfig {
  const projectId = valueFrom(env, "PROJECT_ID", "BUILD_PROJECT_ID");
  if (!projectId) {
    throw new Error("PROJECT_ID is required.");
  }

  const mode = valueFrom(env, "BUILD_MODE") || "first_generate";
  if (mode !== "first_generate" && mode !== "retry_build") {
    throw new Error("BUILD_MODE must be first_generate or retry_build.");
  }

  const reviewHash = valueFrom(env, "BUILD_REVIEW_HASH", "REVIEW_HASH");
  if (reviewHash && !/^[0-9a-f]{64}$/.test(reviewHash)) {
    throw new Error(
      "BUILD_REVIEW_HASH must be a 64-character lowercase hex hash.",
    );
  }

  return {
    baseUrl: parseBaseUrl(valueFrom(env, "BASE_URL", "BUILD_BASE_URL")),
    ...(valueFrom(env, "BUILD_HANDOFF_ID", "HANDOFF_ID")
      ? { handoffId: valueFrom(env, "BUILD_HANDOFF_ID", "HANDOFF_ID") }
      : {}),
    mode,
    projectId,
    ...(reviewHash ? { reviewHash } : {}),
    streamTimeoutMs: parseStreamTimeout(
      valueFrom(env, "BUILD_STREAM_TIMEOUT_MS"),
    ),
  };
}

function normalizeAuthCookie(value: string): string {
  return value.includes("=") ? value : `authjs.session-token=${value}`;
}

async function resolveBuildIdentity(
  config: BuildTriggerConfig,
  env: BuildTriggerEnvironment,
): Promise<ResolvedBuildIdentity> {
  const configuredCookie = valueFrom(env, "BUILD_AUTH_COOKIE", "AUTH_COOKIE");
  const configuredHandoffId = config.handoffId;
  const configuredReviewHash = config.reviewHash;

  if (configuredCookie && configuredHandoffId && configuredReviewHash) {
    return {
      cookie: normalizeAuthCookie(configuredCookie),
      handoffId: configuredHandoffId,
      localDatabase: false,
      reviewHash: configuredReviewHash,
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: config.projectId },
    select: { activeHandoffId: true, userId: true },
  });
  if (!project) {
    throw new Error("PROJECT_ID was not found in the local database.");
  }

  const handoffId = configuredHandoffId || project.activeHandoffId;
  if (!handoffId) {
    throw new Error(
      "No active handoff found. Set BUILD_HANDOFF_ID and BUILD_REVIEW_HASH explicitly.",
    );
  }
  const handoff = await prisma.projectBuildHandoff.findUnique({
    where: { id: handoffId },
    select: { reviewHash: true, status: true },
  });
  const reviewHash = configuredReviewHash || handoff?.reviewHash;
  if (!reviewHash || handoff?.status === "rejected") {
    throw new Error(
      "No usable handoff proof found. Set BUILD_HANDOFF_ID and BUILD_REVIEW_HASH explicitly.",
    );
  }

  const cookie = configuredCookie
    ? normalizeAuthCookie(configuredCookie)
    : await createLocalAuthCookie(project.userId);
  return { cookie, handoffId, localDatabase: true, reviewHash };
}

async function createLocalAuthCookie(userId: string): Promise<string> {
  const secret = authConfig.secret;
  if (!secret) {
    throw new Error(
      "Auth secret is not configured for local JWT authentication.",
    );
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  const token = await encode({
    salt: "authjs.session-token",
    secret,
    token: {
      sub: userId,
      ...(user?.email ? { email: user.email } : {}),
      ...(user?.name ? { name: user.name } : {}),
    },
  });
  return `authjs.session-token=${token}`;
}

function printSseBlock(block: string): void {
  const event = block.match(/^event: (.+)$/m)?.[1];
  const data = block.match(/^data: (.+)$/m)?.[1];
  if (!event || !data) {
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }

  const title =
    (typeof payload.title === "string" && payload.title) ||
    (typeof payload.label === "string" && payload.label) ||
    (typeof payload.message === "string" && payload.message) ||
    event;
  const detail = typeof payload.detail === "string" ? payload.detail : "";
  process.stdout.write(`[${event}] ${title}${detail ? ` — ${detail}` : ""}\n`);
}

export async function streamBuildProgress(
  response: Response,
  timeoutMs: number,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Generate trigger returned no progress stream.");
  }

  let observerTimedOut = false;
  const timeout = setTimeout(() => {
    observerTimedOut = true;
    void reader.cancel("build progress wait timed out");
  }, timeoutMs);
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        printSseBlock(block);
      }
    }
    if (buffer) {
      printSseBlock(buffer);
    }
    if (observerTimedOut) {
      throw new Error(
        "Build progress stream timed out; inspect the server status because the bounded worker may still be finishing.",
      );
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

async function main(env: BuildTriggerEnvironment = process.env): Promise<void> {
  const config = readBuildTriggerConfig(env);
  const identity = await resolveBuildIdentity(config, env);
  const origin = new URL(config.baseUrl).origin;
  const response = await fetch(
    `${config.baseUrl}/api/projects/${encodeURIComponent(config.projectId)}/generate`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: identity.cookie,
        origin,
        referer: `${config.baseUrl}/projects/${encodeURIComponent(config.projectId)}`,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({
        handoffId: identity.handoffId,
        idempotencyKey:
          valueFrom(env, "BUILD_IDEMPOTENCY_KEY") ||
          `script-${randomUUID().replace(/-/g, "")}`,
        mode: config.mode,
        reviewHash: identity.reviewHash,
      }),
      signal: AbortSignal.timeout(config.streamTimeoutMs),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Generate trigger failed with HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  }

  process.stdout.write(
    "Real generate trigger accepted; streaming workspace progress.\n",
  );
  await streamBuildProgress(response, config.streamTimeoutMs);

  if (identity.localDatabase) {
    const [build, project] = await Promise.all([
      prisma.projectBuild.findFirst({
        where: { projectId: config.projectId },
        orderBy: { createdAt: "desc" },
        select: {
          artifactRef: true,
          finishedAt: true,
          startedAt: true,
          status: true,
        },
      }),
      prisma.project.findUnique({
        where: { id: config.projectId },
        select: { buildStatus: true, status: true },
      }),
    ]);
    process.stdout.write(
      `${JSON.stringify({
        build: {
          artifact: Boolean(build?.artifactRef),
          finished: Boolean(build?.finishedAt),
          started: Boolean(build?.startedAt),
          status: build?.status ?? "missing",
        },
        project,
      })}\n`,
    );
  }
}

const isMainModule =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main()
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect().catch(() => undefined));
}
