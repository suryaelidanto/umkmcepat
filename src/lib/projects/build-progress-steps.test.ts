import { describe, expect, it } from "vitest";

import {
  appendBuildProgressStep,
  completeBuildProgressSteps,
  mergeHydratedBuildProgress,
  type ProgressStepLike,
  resolveCurrentBuildProgressStep,
} from "./build-progress-steps";

describe("appendBuildProgressStep", () => {
  it("appends same label as separate cards", () => {
    let steps: ProgressStepLike[] = appendBuildProgressStep([], {
      detail: "a.ts",
      label: "Menulis file",
      status: "done",
    });
    steps = appendBuildProgressStep(steps, {
      detail: "b.ts",
      label: "Menulis file",
      status: "done",
    });
    steps = appendBuildProgressStep(steps, {
      detail: "c.ts",
      label: "Menulis file",
      status: "active",
    });

    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.detail)).toEqual(["a.ts", "b.ts", "c.ts"]);
    expect(steps[0].status).toBe("done");
    expect(steps[1].status).toBe("done");
    expect(steps[2].status).toBe("active");
  });

  it("does not cap length", () => {
    let steps: ProgressStepLike[] = [];
    for (let i = 0; i < 12; i += 1) {
      steps = appendBuildProgressStep(steps, {
        detail: `f${i}`,
        label: "Menulis file",
        status: "done",
      });
    }
    expect(steps).toHaveLength(12);
  });

  it("marks previous active as done and computes duration when appending", () => {
    const now = Date.now();
    const steps = appendBuildProgressStep<ProgressStepLike>(
      [
        {
          detail: "x",
          label: "Membaca file",
          status: "active",
          startedAt: now - 5000,
        },
      ],
      { detail: "y", label: "Menulis file", status: "active" },
    );
    expect(steps[0].status).toBe("done");
    expect(steps[0].durationMs).toBeGreaterThanOrEqual(5000);
    expect(steps[1].status).toBe("active");
    expect(steps[1].startedAt).toBeGreaterThanOrEqual(now);
  });

  it("preserves error status on prior steps", () => {
    const steps = appendBuildProgressStep(
      [{ detail: "bad", label: "Menulis file", status: "error" as const }],
      { detail: "ok", label: "Menulis file", status: "done" as const },
    );
    expect(steps[0].status).toBe("error");
    expect(steps[1].status).toBe("done");
  });
});

describe("completeBuildProgressSteps", () => {
  it("only flips active to done", () => {
    const steps = completeBuildProgressSteps([
      { detail: "a", label: "A", status: "done" as const },
      { detail: "b", label: "B", status: "active" as const },
      { detail: "c", label: "C", status: "error" as const },
    ]);
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "error"]);
  });
});

describe("mergeHydratedBuildProgress", () => {
  const live: ProgressStepLike[] = [
    { detail: "a", label: "Memahami usaha", status: "done" },
    { detail: "b", label: "Menulis file", status: "done" },
    { detail: "c", label: "Menulis file", status: "done" },
  ];

  it("keeps live rows when the server list is shorter", () => {
    const merged = mergeHydratedBuildProgress(live, [
      { detail: "a", label: "Memahami usaha", status: "done" },
    ]);
    expect(merged).toBe(live);
  });

  it("keeps live rows when the lists are the same length", () => {
    const merged = mergeHydratedBuildProgress(live, [
      { detail: "", label: "Memahami usaha", status: "done" },
      { detail: "", label: "Menulis file", status: "done" },
      { detail: "", label: "Menulis file", status: "done" },
    ]);
    expect(merged).toBe(live);
  });

  it("adopts the server list when it is strictly longer", () => {
    const hydrated: ProgressStepLike[] = [
      ...live,
      { detail: "d", label: "Menyiapkan preview", status: "active" },
    ];
    expect(mergeHydratedBuildProgress(live, hydrated)).toBe(hydrated);
  });
});

describe("resolveCurrentBuildProgressStep", () => {
  it("returns null when there are no steps", () => {
    expect(resolveCurrentBuildProgressStep([])).toBeNull();
  });

  it("returns the newest row even when it is already done", () => {
    const step = resolveCurrentBuildProgressStep<ProgressStepLike>([
      { detail: "brief", label: "Memahami usaha", status: "active" },
      { detail: "src/routes/index.tsx", label: "Menulis file", status: "done" },
    ]);
    expect(step?.label).toBe("Menulis file");
  });
});
