import { describe, expect, it, vi } from "vitest";

import {
  createLocalBuildWorker,
  isStaleBuildAttempt,
} from "@/lib/projects/build-worker";

describe("build worker", () => {
  it("returns succeeded with an artifact ref", async () => {
    const worker = createLocalBuildWorker({
      buildProject: vi.fn(async () => ({
        distFiles: [
          { path: "index.html", content: "ok", contentType: "text/html" },
        ],
        log: "ok",
        ok: true,
      })),
      writeArtifact: vi.fn(async () => "project-artifact:local:dist:build_1"),
    });

    await expect(
      worker.runBuild({ buildId: "build_1", files: [] }),
    ).resolves.toMatchObject({
      artifactRef: "project-artifact:local:dist:build_1",
      failureReason: null,
      status: "succeeded",
    });
  });

  it("classifies failed builds", async () => {
    const worker = createLocalBuildWorker({
      buildProject: vi.fn(async () => ({
        distFiles: [],
        log: "Generated app package policy failed preflight",
        ok: false,
      })),
    });

    await expect(
      worker.runBuild({ buildId: "build_1", files: [] }),
    ).resolves.toMatchObject({
      artifactRef: null,
      failureReason: "blocked_package",
      status: "failed",
    });
  });

  it("allows concurrent runBuild calls (capacity is BullMQ, not in-process reject)", async () => {
    const worker = createLocalBuildWorker({
      buildProject: vi.fn(async () => ({
        distFiles: [
          { path: "index.html", content: "ok", contentType: "text/html" },
        ],
        log: "ok",
        ok: true,
      })),
      writeArtifact: vi.fn(
        async (input: { artifactId: string }) =>
          `project-artifact:local:dist:${input.artifactId}`,
      ),
    });

    const [first, second] = await Promise.all([
      worker.runBuild({ buildId: "build_1", files: [] }),
      worker.runBuild({ buildId: "build_2", files: [] }),
    ]);

    expect(first.status).toBe("succeeded");
    expect(second.status).toBe("succeeded");
  });

  it("detects stale running attempts", () => {
    expect(
      isStaleBuildAttempt({
        now: new Date("2026-07-07T01:20:00.000Z"),
        startedAt: new Date("2026-07-07T01:00:00.000Z"),
        status: "running",
        staleAfterMs: 15 * 60 * 1000,
      }),
    ).toBe(true);
  });
});
