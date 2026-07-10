import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";

import { chromium, type BrowserContext } from "playwright-core";

import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { readProjectDistArtifact } from "@/lib/projects/runtime-artifacts";

const REF_PREFIX = "project-thumbnail:local:";
const MAX_BYTES = 1024 * 1024;
const latestRequestedBuild = new Map<string, string>();
let activeCaptures = 0;

export type ProjectThumbnailOptions = { rootDir?: string };

export function createProjectThumbnailRef(projectId: string) {
  assertSafeId(projectId);
  return `${REF_PREFIX}${projectId}`;
}

export async function writeProjectThumbnail({
  bytes,
  projectId,
  rootDir,
}: ProjectThumbnailOptions & { bytes: Buffer; projectId: string }) {
  assertSafeId(projectId);
  assertJpeg(bytes);
  const root = resolveRoot(rootDir);
  const target = path.join(root, `${projectId}.jpg`);
  const temporary = path.join(root, `.${projectId}.${crypto.randomUUID()}.tmp`);

  await mkdir(root, { recursive: true });
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }

  return createProjectThumbnailRef(projectId);
}

export async function readProjectThumbnail(
  ref: string,
  { rootDir }: ProjectThumbnailOptions = {},
) {
  const projectId = parseRef(ref);
  return readFile(path.join(resolveRoot(rootDir), `${projectId}.jpg`));
}

export async function deleteProjectThumbnail(
  ref: string,
  { rootDir }: ProjectThumbnailOptions = {},
) {
  const projectId = parseRef(ref);
  await rm(path.join(resolveRoot(rootDir), `${projectId}.jpg`), {
    force: true,
  });
}

export async function refreshProjectThumbnail({
  artifactRef,
  buildId,
  force = false,
  projectId,
}: {
  artifactRef: string;
  buildId: string;
  force?: boolean;
  projectId: string;
}) {
  if (!isCaptureEnabled()) {
    return;
  }
  latestRequestedBuild.set(projectId, buildId);

  if (!force) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { thumbnailBuildId: true, thumbnailRef: true },
    });
    if (project?.thumbnailRef && project.thumbnailBuildId === buildId) {
      return;
    }
  }

  if (activeCaptures >= positiveInt("PROJECT_THUMBNAIL_CONCURRENCY", 1)) {
    devLog("thumbnail", "capture.skipped", {
      buildId,
      projectId,
      reason: "concurrency",
    });
    return;
  }

  activeCaptures += 1;
  const startedAt = Date.now();
  devLog("thumbnail", "capture.started", { buildId, projectId });

  try {
    const bytes = await captureProjectThumbnail(artifactRef);
    if (latestRequestedBuild.get(projectId) !== buildId) {
      devLog("thumbnail", "capture.superseded", { buildId, projectId });
      return;
    }

    const latest = await prisma.projectBuild.findFirst({
      where: { projectId, status: "succeeded" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (latest?.id !== buildId) {
      devLog("thumbnail", "capture.superseded", { buildId, projectId });
      return;
    }

    const thumbnailRef = await writeProjectThumbnail({ bytes, projectId });
    const promoted = await prisma.project.updateMany({
      where: { id: projectId },
      data: {
        thumbnailBuildId: buildId,
        thumbnailRef,
        thumbnailUpdatedAt: new Date(),
      },
    });
    if (!promoted.count) {
      await deleteProjectThumbnail(thumbnailRef).catch(() => undefined);
      return;
    }

    devLog("thumbnail", "capture.succeeded", {
      buildId,
      bytes: bytes.length,
      durationMs: Date.now() - startedAt,
      projectId,
    });
  } catch (error) {
    devLog("thumbnail", "capture.failed", {
      buildId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      projectId,
    });
  } finally {
    activeCaptures -= 1;
    if (latestRequestedBuild.get(projectId) === buildId) {
      latestRequestedBuild.delete(projectId);
    }
  }
}

export async function captureProjectThumbnail(artifactRef: string) {
  const files = await readProjectDistArtifact(artifactRef);
  return withTimeout(
    runThumbnailCapture(files),
    positiveInt("PROJECT_THUMBNAIL_TIMEOUT_MS", 15_000),
  );
}

async function runThumbnailCapture(
  files: Awaited<ReturnType<typeof readProjectDistArtifact>>,
) {
  const server = await startArtifactServer(files);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let context: BrowserContext | null = null;
  const timeout = positiveInt("PROJECT_THUMBNAIL_TIMEOUT_MS", 15_000);

  try {
    browser = await chromium.launch({
      executablePath: process.env.PROJECT_THUMBNAIL_BROWSER_PATH || undefined,
      headless: true,
    });
    context = await browser.newContext({
      colorScheme: "light",
      locale: "id-ID",
      reducedMotion: "reduce",
      timezoneId: "Asia/Jakarta",
      viewport: { height: 900, width: 1440 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        url.origin === server.origin ||
        url.protocol === "data:" ||
        url.protocol === "blob:"
      ) {
        await route.continue();
      } else {
        await route.abort("blockedbyclient");
      }
    });
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    await page.evaluate(() =>
      Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]),
    );
    await page.addStyleTag({
      content:
        "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
    });
    await page.waitForTimeout(350);
    const bytes = Buffer.from(
      await page.screenshot({ fullPage: false, quality: 80, type: "jpeg" }),
    );
    assertJpeg(bytes);
    return bytes;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await stopServer(server.server);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Project thumbnail capture timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function resolveRoot(rootDir?: string) {
  return path.resolve(
    rootDir || process.env.PROJECT_THUMBNAIL_DIR || ".data/project-thumbnails",
  );
}

function parseRef(ref: string) {
  if (!ref.startsWith(REF_PREFIX)) {
    throw new Error("Invalid project thumbnail ref.");
  }
  const id = ref.slice(REF_PREFIX.length);
  assertSafeId(id);
  return id;
}

function assertSafeId(id: string) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
    throw new Error("Invalid project thumbnail id.");
  }
}

function assertJpeg(bytes: Buffer) {
  if (
    bytes.length < 5 ||
    bytes.length > MAX_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    throw new Error("Invalid project thumbnail JPEG.");
  }
}

function isCaptureEnabled() {
  const raw =
    process.env.PROJECT_THUMBNAIL_CAPTURE_ENABLED?.trim().toLowerCase();
  return raw ? raw === "true" : true;
}

function positiveInt(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

type DistFile = { content: string; contentType: string; path: string };

async function startArtifactServer(files: DistFile[]) {
  const byPath = new Map(
    files.map((file) => [normalizeUrlPath(file.path), file]),
  );
  const server = createServer((request, response) => {
    const pathname = normalizeUrlPath(
      new URL(request.url || "/", "http://localhost").pathname,
    );
    const file =
      byPath.get(pathname) ||
      (pathname.endsWith("/")
        ? byPath.get(`${pathname}index.html`)
        : undefined) ||
      byPath.get("index.html");
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
    throw new Error("Thumbnail server failed to bind.");
  }
  return { origin: `http://127.0.0.1:${address.port}/`, server };
}

function normalizeUrlPath(value: string) {
  return decodeURIComponent(value).replace(/^\/+/, "") || "index.html";
}

function stopServer(server: Server) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}
