import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  materializeProjectDistArtifact,
  readProjectDistArtifact,
  readProjectSourceArtifact,
  writeProjectDistArtifact,
  writeProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";

// Decode a fetch body the way a real R2 store would when read back via
// response.text(): bytes -> utf8 string. String(Uint8Array) mangles bytes,
// so Buffer-backed bodies (the shared signedR2Fetch sends Uint8Array) must
// be decoded here.
function bodyToString(body: unknown): string {
  if (body == null) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body).toString("utf8");
  }
  return String(body);
}

const { r2Objects, signedR2FetchMock } = vi.hoisted(() => {
  const r2Objects = new Map<string, string>();
  const signedR2FetchMock = vi.fn(
    async (
      config: { bucket: string; prefix: string },
      key: string,
      input: { body?: unknown; method: string },
    ) => {
      const fullKey = config.prefix ? `${config.prefix}/${key}` : key;
      if (input.method === "PUT") {
        r2Objects.set(fullKey, bodyToString(input.body));
        return new Response(null, { status: 200 });
      }
      if (input.method === "DELETE") {
        r2Objects.delete(fullKey);
        return new Response(null, { status: 204 });
      }
      return new Response(r2Objects.get(fullKey) ?? "", {
        status: r2Objects.has(fullKey) ? 200 : 404,
      });
    },
  );
  return { r2Objects, signedR2FetchMock };
});

vi.mock("@/lib/r2-client", () => ({
  getR2Config: () => {
    if (!process.env.R2_ACCESS_KEY_ID) {
      throw new Error("R2_ACCESS_KEY_ID is required for R2 object storage.");
    }
    return {
      accessKeyId: "a",
      accountId: "b",
      bucket: "pub-artifacts",
      prefix: "project-artifacts",
      secretAccessKey: "s",
    };
  },
  signedR2Fetch: signedR2FetchMock,
  R2Config: {} as never,
}));

let tempDir = "";
const originalEnv = { ...process.env };

describe("project runtime artifacts", () => {
  beforeEach(() => {
    r2Objects.clear();
    signedR2FetchMock.mockClear();
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = "";
    }

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
    useR2Env();

    const ref = await writeProjectSourceArtifact({
      artifactId: "snapshot_r2",
      files: [{ content: "export const ok = true;", path: "src/main.ts" }],
    });
    const files = await readProjectSourceArtifact(ref);

    expect(ref).toBe("project-artifact:r2:source:snapshot_r2");
    expect(files).toEqual([
      { content: "export const ok = true;", path: "src/main.ts" },
    ]);
    expect(signedR2FetchMock.mock.calls.map((call) => call[2].method)).toEqual([
      "PUT",
      "PUT",
      "GET",
      "GET",
    ]);
    expect(signedR2FetchMock.mock.calls[1][1]).toBe(
      "project-artifacts/source/snapshot_r2/manifest.json",
    );
  });

  it("routes R2 project artifacts to the public bucket", async () => {
    useR2Env();

    const ref = await writeProjectSourceArtifact({
      artifactId: "snapshot_pub",
      files: [{ content: "export const ok = true;", path: "src/main.ts" }],
    });

    expect(ref.startsWith("project-artifact:r2:")).toBe(true);
    expect(signedR2FetchMock).toHaveBeenCalled();
    for (const call of signedR2FetchMock.mock.calls) {
      expect(call[0].bucket).toBe("pub-artifacts");
    }
  });

  it("materializes R2 dist artifacts", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "umkmcepat-artifacts-"));
    useR2Env();

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
    process.env.STORAGE_PROVIDER = "r2";
    // bun auto-loads .env (which has real R2 creds in dev); delete them so
    // the missing-cred throw is deterministic, not .env-dependent.
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_PUBLIC_BUCKET;
    delete process.env.R2_SECRET_ACCESS_KEY;

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
  process.env.STORAGE_PROVIDER = "r2";
  process.env.R2_ACCOUNT_ID = "account";
  process.env.R2_ACCESS_KEY_ID = "access";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_PUBLIC_BUCKET = "bucket";
}
