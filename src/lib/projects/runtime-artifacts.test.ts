import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  materializeProjectDistArtifact,
  readProjectDistArtifact,
  readProjectSourceArtifact,
  writeProjectDistArtifact,
  writeProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";

let tempDir = "";
const originalEnv = { ...process.env };

describe("project runtime artifacts", () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = "";
    }

    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("writes and reads generated source artifacts", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-artifacts-"));

    const ref = await writeProjectSourceArtifact({
      artifactId: "snapshot_1",
      files: [{ content: "export const ok = true;", path: "src/main.ts" }],
      rootDir: tempDir,
    });
    const files = await readProjectSourceArtifact(ref, { rootDir: tempDir });

    expect(ref).toBe("project-artifact:local:source:snapshot_1");
    expect(files).toEqual([
      { content: "export const ok = true;", path: "src/main.ts" },
    ]);
  });

  it("writes, reads, and materializes dist artifacts", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-artifacts-"));

    const ref = await writeProjectDistArtifact({
      artifactId: "build_1",
      files: [
        {
          content: "<h1>Preview</h1>",
          contentType: "text/html; charset=utf-8",
          path: "index.html",
        },
      ],
      rootDir: tempDir,
    });
    const files = await readProjectDistArtifact(ref, { rootDir: tempDir });
    const runtimeRoot = path.join(tempDir, "runtime");

    await materializeProjectDistArtifact(ref, runtimeRoot, {
      rootDir: tempDir,
    });

    expect(files).toEqual([
      {
        content: "<h1>Preview</h1>",
        contentType: "text/html; charset=utf-8",
        path: "index.html",
      },
    ]);
    await expect(
      readFile(path.join(runtimeRoot, "index.html"), "utf8"),
    ).resolves.toBe("<h1>Preview</h1>");
  });

  it("cleans temp artifacts after failed writes", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-artifacts-"));

    await expect(
      writeProjectSourceArtifact({
        artifactId: "snapshot_1",
        files: [
          { content: "ok", path: "src/main.ts" },
          { content: "secret", path: "../.env" },
        ],
        rootDir: tempDir,
      }),
    ).rejects.toThrow("Unsafe generated file path");

    await expect(readdir(path.join(tempDir, "source"))).rejects.toThrow();
  });

  it("writes and reads R2 source artifacts", async () => {
    const objects = new Map<string, string>();
    const requests: Array<{ body?: unknown; method: string; url: string }> = [];

    useR2Env();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ body: init?.body, method: init?.method || "GET", url });
        const key = decodeURIComponent(new URL(url).pathname).replace(
          "/bucket/",
          "",
        );

        if (init?.method === "PUT") {
          objects.set(key, String(init.body));
          return new Response(null, { status: 200 });
        }

        return new Response(objects.get(key) || "", {
          status: objects.has(key) ? 200 : 404,
        });
      }),
    );

    const ref = await writeProjectSourceArtifact({
      artifactId: "snapshot_r2",
      files: [{ content: "export const ok = true;", path: "src/main.ts" }],
    });
    const files = await readProjectSourceArtifact(ref);

    expect(ref).toBe("project-artifact:r2:source:snapshot_r2");
    expect(files).toEqual([
      { content: "export const ok = true;", path: "src/main.ts" },
    ]);
    expect(requests.map((request) => request.method)).toEqual([
      "PUT",
      "PUT",
      "GET",
      "GET",
    ]);
    expect(requests[1].url).toContain(
      "/bucket/project-artifacts/source/snapshot_r2/manifest.json",
    );
  });

  it("materializes R2 dist artifacts", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-artifacts-"));
    const objects = new Map<string, string>();

    useR2Env();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const key = decodeURIComponent(new URL(url).pathname).replace(
          "/bucket/",
          "",
        );

        if (init?.method === "PUT") {
          objects.set(key, String(init.body));
          return new Response(null, { status: 200 });
        }

        return new Response(objects.get(key) || "", {
          status: objects.has(key) ? 200 : 404,
        });
      }),
    );

    const ref = await writeProjectDistArtifact({
      artifactId: "build_r2",
      files: [
        {
          content: "<h1>R2 Preview</h1>",
          contentType: "text/html; charset=utf-8",
          path: "index.html",
        },
      ],
    });
    const runtimeRoot = path.join(tempDir, "runtime");

    await materializeProjectDistArtifact(ref, runtimeRoot);

    expect(ref).toBe("project-artifact:r2:dist:build_r2");
    await expect(
      readFile(path.join(runtimeRoot, "index.html"), "utf8"),
    ).resolves.toBe("<h1>R2 Preview</h1>");
  });

  it("requires R2 env before writing project artifacts", async () => {
    process.env.PROJECT_ARTIFACT_STORAGE_PROVIDER = "r2";

    await expect(
      writeProjectSourceArtifact({
        artifactId: "snapshot_missing_env",
        files: [{ content: "ok", path: "src/main.ts" }],
      }),
    ).rejects.toThrow("R2_ACCESS_KEY_ID is required");
  });

  it("rejects unsafe generated artifact paths", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-artifacts-"));

    await expect(
      writeProjectSourceArtifact({
        artifactId: "snapshot_1",
        files: [{ content: "secret", path: "../.env" }],
        rootDir: tempDir,
      }),
    ).rejects.toThrow("Unsafe generated file path");
  });
});

function useR2Env() {
  process.env.PROJECT_ARTIFACT_STORAGE_PROVIDER = "r2";
  process.env.R2_ACCOUNT_ID = "account";
  process.env.R2_ACCESS_KEY_ID = "access";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET = "bucket";
}
