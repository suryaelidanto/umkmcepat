import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

import type {
  BrowserAssertion,
  BrowserGateReport,
  BrowserRouteReport,
} from "./browser-gates";
import type { GeneratedSiteContractV1 } from "./generated-site-contract";
import type { GeneratedDistFile } from "./generated-types";

type BrowserRunnerOutput = {
  routes: Array<BrowserRouteReport & { screenshot?: string }>;
};

type BrowserRunnerDeps = {
  execute: (input: {
    files: GeneratedDistFile[];
    routes: string[];
    timeoutMs: number;
  }) => Promise<string>;
  storeEvidence: (input: {
    projectId: string;
    candidateId: string;
    route: string;
    viewport: "mobile" | "desktop";
    value: unknown;
  }) => Promise<string>;
};

export function parseBrowserRunnerOutput(raw: string): BrowserRunnerOutput {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("generated-site browser output malformed");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("generated-site browser output malformed");
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.routes)) {
    throw new Error("generated-site browser output malformed");
  }
  return { routes: record.routes.map(parseRoute) };
}

export async function runGeneratedSiteBrowserGates(
  input: {
    projectId: string;
    candidateId: string;
    files: GeneratedDistFile[];
    contract: GeneratedSiteContractV1;
    timeoutMs: number;
  },
  deps: Partial<BrowserRunnerDeps> = {},
): Promise<BrowserGateReport> {
  const startedAt = Date.now();
  try {
    const raw = await (deps.execute ?? executeBrowserRunner)({
      files: input.files,
      routes: input.contract.page.routes.map((route) => route.path).slice(0, 6),
      timeoutMs: input.timeoutMs,
    });
    const parsed = parseBrowserRunnerOutput(raw);
    const evidenceIds: string[] = [];
    for (const route of parsed.routes) {
      const evidence = await (deps.storeEvidence ?? (async () => ""))({
        projectId: input.projectId,
        candidateId: input.candidateId,
        route: route.route,
        viewport: route.viewport,
        value: route,
      });
      if (evidence) {
        evidenceIds.push(evidence);
      }
    }
    const failed = parsed.routes.some((route) =>
      route.assertions.some((assertion) => assertion.status !== "pass"),
    );
    return {
      version: 1,
      status: failed ? "fail" : "pass",
      routes: parsed.routes.map(
        ({ screenshot: _screenshot, ...route }) => route,
      ),
      evidenceIds,
      overheadMs: Date.now() - startedAt,
    };
  } catch {
    return {
      version: 1,
      status: "infrastructure_error",
      routes: [],
      evidenceIds: [],
      overheadMs: Date.now() - startedAt,
    };
  }
}

async function executeBrowserRunner(input: {
  files: GeneratedDistFile[];
  routes: string[];
  timeoutMs: number;
}): Promise<string> {
  const server = await startArtifactServer(input.files);
  try {
    return await spawnRunner({
      origin: server.origin,
      routes: input.routes,
      timeoutMs: input.timeoutMs,
    });
  } finally {
    server.server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.server.close(() => resolve()));
  }
}

async function startArtifactServer(files: GeneratedDistFile[]) {
  const byPath = new Map(files.map((file) => [normalizePath(file.path), file]));
  const server = createServer((request, response) => {
    const pathname = normalizePath(
      new URL(request.url || "/", "http://localhost").pathname,
    );
    const file = byPath.get(pathname) ?? byPath.get("index.html");
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": file.contentType,
      "X-Content-Type-Options": "nosniff",
    });
    response.end(file.content);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("generated-site browser server failed to bind");
  }
  return { origin: `http://127.0.0.1:${address.port}/`, server };
}

function spawnRunner(input: {
  origin: string;
  routes: string[];
  timeoutMs: number;
}): Promise<string> {
  const script = path.resolve(
    process.cwd(),
    "scripts/qualify-generated-site.cjs",
  );
  const node = process.env.PROJECT_THUMBNAIL_NODE_PATH || "node";
  const executable = browserExecutable();
  return new Promise((resolve, reject) => {
    const child = spawn(
      node,
      [
        script,
        input.origin,
        JSON.stringify(input.routes),
        executable ?? "",
        String(input.timeoutMs),
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(
      () => {
        child.kill("SIGKILL");
        reject(new Error("generated-site browser qualification timed out"));
      },
      input.timeoutMs * Math.max(2, input.routes.length * 2),
    );
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            Buffer.concat(stderr).toString("utf8") ||
              "generated-site browser qualification failed",
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

function browserExecutable(): string | undefined {
  const configured = process.env.PROJECT_THUMBNAIL_BROWSER_PATH?.trim();
  if (configured) {
    return configured;
  }
  if (process.platform === "win32") {
    for (const candidate of [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ]) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function normalizePath(value: string): string {
  return decodeURIComponent(value).replace(/^\/+/, "") || "index.html";
}

function parseRoute(
  value: unknown,
): BrowserRouteReport & { screenshot?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("generated-site browser output malformed");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.route !== "string" ||
    (record.viewport !== "mobile" && record.viewport !== "desktop") ||
    !Array.isArray(record.assertions)
  ) {
    throw new Error("generated-site browser output malformed");
  }
  return {
    route: record.route,
    viewport: record.viewport,
    assertions: record.assertions.map(parseAssertion),
    ...(typeof record.screenshot === "string"
      ? { screenshot: record.screenshot }
      : {}),
  };
}

function parseAssertion(value: unknown): BrowserAssertion {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("generated-site browser output malformed");
  }
  const record = value as Record<string, unknown>;
  const statuses = new Set(["pass", "fail", "infrastructure_error"]);
  if (
    typeof record.name !== "string" ||
    typeof record.status !== "string" ||
    !statuses.has(record.status)
  ) {
    throw new Error("generated-site browser output malformed");
  }
  return {
    name: record.name as BrowserAssertion["name"],
    status: record.status as BrowserAssertion["status"],
    ...(typeof record.detail === "string" ? { detail: record.detail } : {}),
  };
}
