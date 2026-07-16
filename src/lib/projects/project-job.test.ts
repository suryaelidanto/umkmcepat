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
});
