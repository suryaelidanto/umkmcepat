import { describe, expect, it } from "vitest";

import {
  deriveActiveProjectJob,
  mapActiveJobStepsToBuildProgress,
} from "@/lib/projects/project-job";

describe("deriveActiveProjectJob", () => {
  it("returns null when nothing is running", () => {
    expect(
      deriveActiveProjectJob({
        build: {
          createdAt: "2026-07-16T00:00:00.000Z",
          id: "b1",
          status: "succeeded",
          updatedAt: "2026-07-16T00:01:00.000Z",
        },
      }),
    ).toBeNull();
  });

  it("hydrates a running build with startedAt and steps", () => {
    const job = deriveActiveProjectJob({
      build: {
        createdAt: "2026-07-16T00:00:00.000Z",
        id: "b1",
        startedAt: "2026-07-16T00:00:10.000Z",
        status: "running",
        updatedAt: "2026-07-16T00:00:40.000Z",
      },
      events: [
        {
          buildId: "b1",
          createdAt: "2026-07-16T00:00:15.000Z",
          message: "AI menulis source",
          metadata: {
            detail: "Agent mengedit file",
            label: "AI menulis source",
          },
          type: "build.progress",
        },
      ],
    });

    expect(job).not.toBeNull();
    expect(job?.phase).toBe("building");
    expect(job?.startedAt).toBe("2026-07-16T00:00:10.000Z");
    expect(job?.buildId).toBe("b1");
    expect(job?.steps.some((step) => step.label === "AI menulis source")).toBe(
      true,
    );
    expect(mapActiveJobStepsToBuildProgress(job!.steps)[0].label).toBeTruthy();
  });

  it("uses synthetic steps when events are empty", () => {
    const job = deriveActiveProjectJob({
      attempt: {
        id: "a1",
        startedAt: "2026-07-16T00:00:00.000Z",
        status: "generating",
      },
    });

    expect(job?.phase).toBe("generating");
    expect(job?.steps.length).toBeGreaterThan(0);
    expect(job?.steps[0]?.status).toBe("active");
  });

  it("keeps same-label progress events as separate steps", () => {
    const job = deriveActiveProjectJob({
      build: {
        createdAt: "2026-07-16T00:00:00.000Z",
        id: "b1",
        startedAt: "2026-07-16T00:00:10.000Z",
        status: "running",
        updatedAt: "2026-07-16T00:00:40.000Z",
      },
      events: [
        {
          buildId: "b1",
          createdAt: "2026-07-16T00:00:30.000Z",
          message: "Menulis file",
          metadata: { detail: "c.ts", label: "Menulis file" },
          type: "build.progress",
        },
        {
          buildId: "b1",
          createdAt: "2026-07-16T00:00:20.000Z",
          message: "Menulis file",
          metadata: { detail: "b.ts", label: "Menulis file" },
          type: "build.progress",
        },
        {
          buildId: "b1",
          createdAt: "2026-07-16T00:00:15.000Z",
          message: "Menulis file",
          metadata: { detail: "a.ts", label: "Menulis file" },
          type: "build.progress",
        },
      ],
    });

    const writes = job?.steps.filter((s) => s.label === "Menulis file") ?? [];
    expect(writes).toHaveLength(3);
    expect(writes.map((s) => s.detail)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("does not cap steps at 8", () => {
    const events = Array.from({ length: 12 }, (_, i) => ({
      buildId: "b1",
      createdAt: `2026-07-16T00:00:${String(i + 10).padStart(2, "0")}.000Z`,
      message: `Step ${i}`,
      metadata: { detail: `d${i}`, label: `Label ${i}` },
      type: "build.progress" as const,
    })).reverse();

    const job = deriveActiveProjectJob({
      build: {
        createdAt: "2026-07-16T00:00:00.000Z",
        id: "b1",
        startedAt: "2026-07-16T00:00:10.000Z",
        status: "running",
        updatedAt: "2026-07-16T00:01:00.000Z",
      },
      events,
    });

    expect(job?.steps.length).toBeGreaterThanOrEqual(12);
  });

  it("treats open visual_comment edit as active even when last build succeeded", () => {
    const job = deriveActiveProjectJob({
      attempt: {
        id: "edit_1",
        kind: "visual_comment",
        startedAt: "2026-07-16T10:20:00.000Z",
        status: "editing",
      },
      build: {
        createdAt: "2026-07-16T09:00:00.000Z",
        finishedAt: "2026-07-16T09:05:00.000Z",
        id: "b_old",
        startedAt: "2026-07-16T09:00:00.000Z",
        status: "succeeded",
        updatedAt: "2026-07-16T09:05:00.000Z",
      },
      projectBuildStatus: "running",
      projectStatus: "building",
    });

    expect(job).not.toBeNull();
    expect(job?.kind).toBe("edit");
    expect(job?.phase).toBe("generating");
    expect(job?.startedAt).toBe("2026-07-16T10:20:00.000Z");
  });
});
