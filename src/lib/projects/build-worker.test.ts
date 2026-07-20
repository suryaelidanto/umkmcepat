import { describe, expect, it, vi } from "vitest";

import {
  createLocalBuildWorker,
  isStaleBuildAttempt,
} from "@/lib/projects/build-worker";
import { type BuildGeneratedProjectResult } from "@/lib/projects/generated-types";

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

  it("rejects a build with concurrency_limit (not stale_worker) when the cap is already hit — this is a distinct, correctly-labeled situation, not a build that stalled", async () => {
    const release: { current: (() => void) | undefined } = {
      current: undefined,
    };
    const worker = createLocalBuildWorker({
      buildProject: vi.fn(() => {
        return new Promise<BuildGeneratedProjectResult>((resolve) => {
          release.current = () => {
            resolve({
              distFiles: [
                { path: "index.html", content: "ok", contentType: "text/html" },
              ],
              log: "ok",
              ok: true,
            });
          };
        });
      }),
      writeArtifact: vi.fn(async () => "project-artifact:local:dist:build_1"),
    });

    const firstBuild = worker.runBuild({ buildId: "build_1", files: [] });
    // The concurrency limit defaults to 1 (PROJECT_BUILD_CONCURRENCY), so a
    // second build started while the first is still running must be rejected.
    const second = await worker.runBuild({ buildId: "build_2", files: [] });

    expect(second).toMatchObject({
      failureReason: "concurrency_limit",
      status: "failed",
    });

    release.current?.();
    await firstBuild;
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
