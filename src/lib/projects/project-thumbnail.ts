import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";

import { getSettingSync } from "@/lib/config/app-settings";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { readProjectDistArtifact } from "@/lib/projects/runtime-artifacts";
import {
  deleteS3Object,
  getS3Object,
  putS3Object,
  S3_PREFIXES,
} from "@/lib/storage/s3-client";
import { getStorageProvider } from "@/lib/storage/storage-provider";

const S3_REF_PREFIX = "project-thumbnail:s3-private:";
const MAX_BYTES = 1024 * 1024;
const latestRequestedBuild = new Map<string, string>();
let activeCaptures = 0;

export type ProjectThumbnailOptions = { rootDir?: string };

export function createProjectThumbnailRef(projectId: string) {
  assertSafeId(projectId);
  return `${S3_REF_PREFIX}${projectId}`;
}

export function parseProjectThumbnailRef(ref: string): string | null {
  if (!ref.startsWith(S3_REF_PREFIX)) {
    return null;
  }
  const id = ref.slice(S3_REF_PREFIX.length);
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
    return null;
  }
  return id;
}

export async function writeProjectThumbnail({
  bytes,
  projectId,
}: ProjectThumbnailOptions & { bytes: Buffer; projectId: string }) {
  assertSafeId(projectId);
  assertJpeg(bytes);
  void getStorageProvider(); // single storage path; s3-client resolves local|r2

  const key = `${S3_PREFIXES.thumbnail}/${projectId}.jpg`;
  await putS3Object("private", key, bytes, "image/jpeg");
  return `${S3_REF_PREFIX}${projectId}`;
}

export async function readProjectThumbnail(
  ref: string,
  _options: ProjectThumbnailOptions = {},
) {
  if (!ref.startsWith(S3_REF_PREFIX)) {
    throw new Error("Invalid project thumbnail ref.");
  }
  const projectId = parseProjectThumbnailRef(ref);
  if (!projectId) {
    throw new Error("Invalid project thumbnail ref.");
  }
  // Copy into a fresh ArrayBuffer-backed Uint8Array so the route's
  const bytes = await getS3Object(
    "private",
    `${S3_PREFIXES.thumbnail}/${projectId}.jpg`,
  );
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export async function deleteProjectThumbnail(
  ref: string,
  _options: ProjectThumbnailOptions = {},
) {
  const projectId = parseRef(ref);
  // deleteS3Object treats NoSuchKey as success, so missing thumbnails are fine.
  await deleteS3Object("private", `${S3_PREFIXES.thumbnail}/${projectId}.jpg`);
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
  if (!force) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { thumbnailBuildId: true, thumbnailRef: true },
    });
    if (project?.thumbnailRef && project.thumbnailBuildId === buildId) {
      return;
    }
  }

  latestRequestedBuild.set(projectId, buildId);

  if (activeCaptures >= getSettingSync("runtime.thumbnail_concurrency", 1)) {
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
  return runThumbnailCapture(
    files,
    getSettingSync("runtime.thumbnail_timeout_ms", 15_000),
  );
}

async function runThumbnailCapture(
  files: Awaited<ReturnType<typeof readProjectDistArtifact>>,
  timeout: number,
) {
  const server = await startArtifactServer(files);

  try {
    const bytes = await captureWithNode({ origin: server.origin, timeout });
    assertJpeg(bytes);
    return bytes;
  } finally {
    await stopServer(server.server);
  }
}

function captureWithNode({
  origin,
  timeout,
}: {
  origin: string;
  timeout: number;
}) {
  const runnerPath = process.execPath;
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts/capture-project-thumbnail.ts",
  );

  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      runnerPath,
      [
        scriptPath,
        origin,
        resolveBrowserExecutablePath() || "",
        String(timeout),
      ],
      {
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error("Project thumbnail capture timed out."));
      void terminateProcessTree(child.pid);
    }, timeout);

    function finish(error?: Error, bytes?: Buffer) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve(bytes || Buffer.alloc(0));
      }
    }

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_BYTES) {
        finish(new Error("Project thumbnail exceeds size limit."));
        void terminateProcessTree(child.pid);
        return;
      }
      output.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (Buffer.concat(errors).length < 2048) {
        errors.push(chunk);
      }
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(errors).toString("utf8").trim();
        finish(
          new Error(
            `Project thumbnail renderer failed${detail ? `: ${detail.slice(0, 1000)}` : "."}`,
          ),
        );
        return;
      }
      finish(undefined, Buffer.concat(output));
    });
  });
}

async function terminateProcessTree(pid: number | undefined) {
  if (!pid) {
    return;
  }
  if (process.platform === "win32") {
    const taskkill = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise<void>((resolve) =>
      taskkill.once("close", () => resolve()),
    );
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    process.kill(pid, "SIGTERM");
  }
}

function resolveBrowserExecutablePath() {
  const configured = process.env.PROJECT_THUMBNAIL_BROWSER_PATH?.trim();
  if (configured) {
    return configured;
  }

  if (process.platform === "win32") {
    const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
    if (existsSync(chrome)) {
      return chrome;
    }

    const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
    if (existsSync(edge)) {
      return edge;
    }
  }

  return undefined;
}

function parseRef(ref: string) {
  const id = parseProjectThumbnailRef(ref);
  if (id === null) {
    throw new Error("Invalid project thumbnail ref.");
  }
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
  return true;
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
  server.closeAllConnections?.();
  return new Promise<void>((resolve) => server.close(() => resolve()));
}
