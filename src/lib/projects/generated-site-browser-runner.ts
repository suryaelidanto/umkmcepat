import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium } from "playwright-core";

import type {
  BrowserAssertion,
  BrowserGateReport,
  BrowserGateReportV2,
  BrowserRouteReport,
  ProfessionalBrowserPolicy,
  ProfessionalBrowserSignal,
} from "./browser-gates";
import type {
  GeneratedSiteContractV1,
  GeneratedSiteWriterContractV3,
} from "./generated-site-contract";
import type { GeneratedDistFile } from "./generated-types";
import type { ProfessionalSiteBlueprintV1 } from "./professional-site-blueprint";

import { devLog } from "@/lib/dev-log";

type BrowserRunnerOutput = {
  routes: Array<BrowserRouteReport & { screenshot?: string }>;
};

type ProfessionalBrowserRunnerOutput = {
  routes: Array<
    BrowserGateReportV2["routes"][number] & { screenshot?: string }
  >;
};

type BrowserRunnerDeps = {
  execute: (input: {
    files: GeneratedDistFile[];
    routes: string[];
    timeoutMs: number;
    professionalPolicy?: ProfessionalBrowserPolicy;
  }) => Promise<string>;
  storeEvidence: (input: {
    projectId: string;
    candidateId: string;
    route: string;
    viewport: "mobile" | "desktop";
    value: unknown;
    screenshot?: Uint8Array;
  }) => Promise<string[]>;
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

export function parseProfessionalBrowserRunnerOutput(
  raw: string,
): ProfessionalBrowserRunnerOutput {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("generated-site professional browser output malformed");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("generated-site professional browser output malformed");
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.routes)) {
    throw new Error("generated-site professional browser output malformed");
  }
  return {
    routes: record.routes.map(parseProfessionalRoute),
  };
}

export async function runProfessionalSiteBrowserGates(
  input: {
    projectId: string;
    candidateId: string;
    files: GeneratedDistFile[];
    contract: GeneratedSiteWriterContractV3;
    blueprint: ProfessionalSiteBlueprintV1;
    timeoutMs: number;
  },
  deps: Partial<BrowserRunnerDeps> = {},
): Promise<BrowserGateReportV2> {
  const startedAt = Date.now();
  const policy = createProfessionalBrowserPolicy(input.blueprint);
  try {
    const raw = await (deps.execute ?? executeBrowserRunner)({
      files: input.files,
      routes: policy.routes.map((route) => route.path).slice(0, 6),
      timeoutMs: input.timeoutMs,
      professionalPolicy: policy,
    });
    const parsed = parseProfessionalBrowserRunnerOutput(raw);
    const evidenceIds: string[] = [];
    for (const route of parsed.routes) {
      const screenshot = route.screenshot
        ? Buffer.from(route.screenshot, "base64")
        : undefined;
      const evidence = await (deps.storeEvidence ?? (async () => []))({
        projectId: input.projectId,
        candidateId: input.candidateId,
        route: route.route,
        viewport: route.viewport,
        value: route,
        screenshot,
      });
      evidenceIds.push(...evidence);
    }
    const failed = parsed.routes.some((route) =>
      route.assertions.some((assertion) => assertion.status !== "pass"),
    );
    return {
      version: 2,
      status: failed ? "fail" : "pass",
      routes: parsed.routes.map(
        ({ screenshot: _screenshot, ...route }) => route,
      ),
      evidenceIds,
      overheadMs: Date.now() - startedAt,
    };
  } catch (error) {
    devLog("generate", "professional-browser-gates.error", {
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : String(error).slice(0, 500),
    });
    return {
      version: 2,
      status: "infrastructure_error",
      routes: [],
      evidenceIds: [],
      overheadMs: Date.now() - startedAt,
    };
  }
}

export function createProfessionalBrowserPolicy(
  blueprint: ProfessionalSiteBlueprintV1,
): ProfessionalBrowserPolicy {
  return {
    routes: blueprint.routes.map((route) => ({
      path: route.path,
      sections: route.sections.map((section) => ({
        id: section.id,
        requiredVisibleTexts: [...section.requiredVisibleTexts],
      })),
      firstView: {
        identityText: route.firstView.identityText,
        offerTexts: [...route.firstView.offerTexts],
        primaryCtaLabel: route.firstView.primaryCtaLabel,
        primaryCtaHref: route.firstView.primaryCtaHref,
      },
    })),
    signatureRoute: blueprint.signatureRoute,
    typography: {
      maxDisplayPx: 96,
      minDisplayLetterSpacingEm: -0.04,
      minBodyPx: 15,
      minBodyLineHeight: 1.4,
      maxBodyCh: 78,
    },
  };
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
    const routePaths = input.contract?.page?.routes
      ?.map((route) => route.path)
      .slice(0, 6) ?? ["/"];
    const raw = await (deps.execute ?? executeBrowserRunner)({
      files: input.files,
      routes: routePaths.length ? routePaths : ["/"],
      timeoutMs: input.timeoutMs,
    });
    const parsed = parseBrowserRunnerOutput(raw);
    const evidenceIds: string[] = [];
    for (const route of parsed.routes) {
      const screenshot = route.screenshot
        ? Buffer.from(route.screenshot, "base64")
        : undefined;
      const evidence = await (deps.storeEvidence ?? (async () => []))({
        projectId: input.projectId,
        candidateId: input.candidateId,
        route: route.route,
        viewport: route.viewport,
        value: route,
        screenshot,
      });
      evidenceIds.push(...evidence);
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
  } catch (error) {
    devLog("generate", "generated-browser-gates.error", {
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : String(error).slice(0, 500),
    });
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
  professionalPolicy?: ProfessionalBrowserPolicy;
}): Promise<string> {
  const server = await startArtifactServer(input.files);
  const evidenceDir = await mkdtemp(`${tmpdir()}/umkmcepat-site-gate-`);
  try {
    const raw = await spawnRunner({
      origin: server.origin,
      routes: input.routes,
      timeoutMs: input.timeoutMs,
      evidenceDir,
      professionalPolicy: input.professionalPolicy,
    });
    const parsed = JSON.parse(raw) as {
      routes?: Array<Record<string, unknown>>;
    };
    for (const route of parsed.routes ?? []) {
      if (typeof route.screenshotPath === "string") {
        route.screenshot = readFileSync(route.screenshotPath).toString(
          "base64",
        );
        delete route.screenshotPath;
      }
    }
    return JSON.stringify(parsed);
  } finally {
    server.server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.server.close(() => resolve()));
    rmSync(evidenceDir, { force: true, recursive: true });
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
  evidenceDir: string;
  professionalPolicy?: ProfessionalBrowserPolicy;
}): Promise<string> {
  const script = path.resolve(
    process.cwd(),
    "scripts/qualify-generated-site.ts",
  );
  const runner = resolveGeneratedBrowserRunner(
    process.execPath,
    process.versions.bun,
  );
  const executable = browserExecutable();
  devLog("generate", "generated-browser-runner.spawn", {
    browserExecutableSet: Boolean(executable),
    runner,
  });
  return new Promise((resolve, reject) => {
    const child = spawn(
      runner,
      [
        script,
        input.origin,
        JSON.stringify(input.routes),
        executable ?? "",
        String(input.timeoutMs),
        input.evidenceDir,
        input.professionalPolicy
          ? JSON.stringify(input.professionalPolicy)
          : "",
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

export function resolveGeneratedBrowserExecutable(
  configured: string | undefined,
  fallback: string | undefined,
): string | undefined {
  return configured?.trim() || fallback?.trim() || undefined;
}

export function resolveGeneratedBrowserRunner(
  processExecutable: string,
  bunVersion: string | undefined,
): string {
  return bunVersion ? processExecutable : "bun";
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
  return resolveGeneratedBrowserExecutable(
    undefined,
    chromium.executablePath(),
  );
}

function normalizePath(value: string): string {
  return decodeURIComponent(value).replace(/^\/+/, "") || "index.html";
}

function parseProfessionalRoute(
  value: unknown,
): ProfessionalBrowserRunnerOutput["routes"][number] {
  const route = parseRoute(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("generated-site professional browser output malformed");
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.professionalSignals)) {
    throw new Error("generated-site professional browser output malformed");
  }
  const signals: ProfessionalBrowserSignal[] = record.professionalSignals.map(
    (signal) => {
      if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
        throw new Error("generated-site professional browser output malformed");
      }
      const value = signal as Record<string, unknown>;
      if (
        typeof value.code !== "string" ||
        typeof value.route !== "string" ||
        (value.viewport !== "mobile" && value.viewport !== "desktop") ||
        typeof value.detail !== "string"
      ) {
        throw new Error("generated-site professional browser output malformed");
      }
      return {
        code: value.code,
        route: value.route,
        viewport: value.viewport,
        detail: value.detail,
      };
    },
  );
  return {
    ...route,
    assertions: route.assertions.map((assertion) => ({
      name: assertion.name as ProfessionalBrowserRunnerOutput["routes"][number]["assertions"][number]["name"],
      status: assertion.status,
      ...(assertion.detail ? { detail: assertion.detail } : {}),
    })),
    professionalSignals: signals,
  };
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
