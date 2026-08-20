import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { encode } from "@auth/core/jwt";

import { authConfig } from "@/lib/auth/auth-config";
import { prisma } from "@/lib/prisma";

export const DISCUSS_TIMEOUT_MIN_MS = 5_000;
export const DISCUSS_TIMEOUT_MAX_MS = 5 * 60_000;
const DEFAULT_DISCUSS_TIMEOUT_MS = 60_000;
const DEFAULT_BASE_URL = "http://localhost:3000";

type DiscussTriggerEnvironment = Readonly<Record<string, string | undefined>>;

export type DiscussTriggerConfig = {
  baseUrl: string;
  message: string;
  mode: "discuss" | "build";
  projectId: string;
  timeoutMs: number;
};

type ResolvedDiscussIdentity = {
  cookie: string;
  localDatabase: boolean;
};

function valueFrom(
  env: DiscussTriggerEnvironment,
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

function parseDiscussTimeout(value: string | undefined): number {
  const parsed = value ? Number(value) : DEFAULT_DISCUSS_TIMEOUT_MS;
  if (
    !Number.isInteger(parsed) ||
    parsed < DISCUSS_TIMEOUT_MIN_MS ||
    parsed > DISCUSS_TIMEOUT_MAX_MS
  ) {
    throw new Error(
      `DISCUSS_TIMEOUT_MS must be an integer from ${DISCUSS_TIMEOUT_MIN_MS} to ${DISCUSS_TIMEOUT_MAX_MS}.`,
    );
  }
  return parsed;
}

export function readDiscussTriggerConfig(
  env: DiscussTriggerEnvironment = process.env,
): DiscussTriggerConfig {
  const projectId = valueFrom(env, "PROJECT_ID", "BUILD_PROJECT_ID");
  if (!projectId) {
    throw new Error(
      "PROJECT_ID is required to trigger discussion (e.g. PROJECT_ID=cm...).",
    );
  }

  const message =
    valueFrom(env, "MESSAGE", "DISCUSS_MESSAGE") ||
    "Halo, saya ingin membuat website untuk usaha ini.";

  const rawMode = valueFrom(env, "DISCUSS_MODE");
  const mode = rawMode === "build" ? "build" : "discuss";

  return {
    baseUrl: parseBaseUrl(valueFrom(env, "BASE_URL")),
    message,
    mode,
    projectId,
    timeoutMs: parseDiscussTimeout(valueFrom(env, "DISCUSS_TIMEOUT_MS")),
  };
}

export async function resolveDiscussIdentity(
  config: DiscussTriggerConfig,
  env: DiscussTriggerEnvironment = process.env,
): Promise<ResolvedDiscussIdentity> {
  const explicitCookie = valueFrom(env, "AUTH_COOKIE", "BUILD_AUTH_COOKIE");
  if (explicitCookie) {
    return {
      cookie: explicitCookie,
      localDatabase: false,
    };
  }

  const project = await prisma.project.findUnique({
    select: {
      id: true,
      userId: true,
      user: { select: { email: true, id: true, name: true } },
    },
    where: { id: config.projectId },
  });

  if (!project) {
    throw new Error(`Project ${config.projectId} was not found in database.`);
  }

  const secret = authConfig.secret;
  if (!secret) {
    throw new Error(
      "Auth secret is not configured for local JWT authentication.",
    );
  }

  const sessionToken = await encode({
    maxAge: 30 * 24 * 60 * 60,
    salt: "authjs.session-token",
    secret,
    token: {
      email: project.user.email ?? "owner@example.com",
      id: project.userId,
      name: project.user.name ?? "Owner",
      sub: project.userId,
    },
  });

  return {
    cookie: `authjs.session-token=${sessionToken}`,
    localDatabase: true,
  };
}

export async function triggerProjectDiscuss(
  config: DiscussTriggerConfig,
  identity: ResolvedDiscussIdentity,
): Promise<{ ok: boolean; responseText: string }> {
  const endpoint = `${config.baseUrl}/api/projects/preview`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  const payload = {
    message: {
      id: `msg-${Date.now()}-${randomUUID().slice(0, 8)}`,
      role: "user",
      parts: [{ type: "text", text: config.message }],
    },
    mode: config.mode,
    projectId: config.projectId,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: identity.cookie,
        Origin: config.baseUrl,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, responseText: text };
    }

    const streamText = await response.text();
    return { ok: true, responseText: streamText };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const config = readDiscussTriggerConfig(process.env);
  const identity = await resolveDiscussIdentity(config, process.env);
  console.log(`Sending message to project ${config.projectId}...`);
  const result = await triggerProjectDiscuss(config, identity);
  console.log(
    JSON.stringify({
      ok: result.ok,
      length: result.responseText.length,
      sample: result.responseText.slice(0, 300),
    }),
  );
  if (!result.ok) {
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
const executingFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (executingFile === currentFile) {
  void main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    })
    .finally(() => prisma.$disconnect().catch(() => undefined));
}
