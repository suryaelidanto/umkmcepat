import { describe, expect, it, vi } from "vitest";

import { runRuntimeSelfHeal } from "@/lib/projects/runtime-self-heal";

vi.mock("@/lib/config", () => ({
  isGeneratedBuildExecutionEnabled: () => true,
}));

const noOpSupervisor = {
  startDeployment: vi.fn().mockResolvedValue(undefined),
  resolveDeploymentTarget: vi
    .fn()
    .mockResolvedValue(new URL("http://127.0.0.1:9999")),
  getDeploymentStatus: vi.fn().mockResolvedValue("running"),
  stopDeployment: vi.fn().mockResolvedValue(undefined),
};

describe("runRuntimeSelfHeal", () => {
  it("returns ok=true, no repair when there are no runtime errors", async () => {
    const result = await runRuntimeSelfHeal({
      artifactRef: "a1",
      deps: {
        captureErrors: vi.fn().mockResolvedValue([]),
        supervisor: noOpSupervisor as never,
      },
      files: [],
      projectId: "p1",
      schema: { businessName: "Test" } as never,
    });
    expect(result.ok).toBe(true);
    expect(result.repairUsed).toBe(false);
    expect(result.runtimeErrors).toEqual([]);
  });

  it("runs a repair + rebuild when runtime errors are found", async () => {
    const repair = vi.fn().mockResolvedValue({
      files: [{ content: "fixed", path: "src/main.ts" }],
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const build = vi.fn().mockResolvedValue({
      ok: true,
      distFiles: [{ content: "dist", path: "index.html" }],
    });
    const writeArtifact = vi
      .fn()
      .mockResolvedValue("project-artifact:local:dist:a1");

    const result = await runRuntimeSelfHeal({
      artifactRef: "a1",
      deps: {
        build,
        captureErrors: vi
          .fn()
          .mockResolvedValue(["ReferenceError: x is not defined"]),
        repair,
        supervisor: noOpSupervisor as never,
        writeArtifact,
      },
      files: [{ content: "broken", path: "src/main.ts" }],
      projectId: "p1",
      schema: { businessName: "Test" } as never,
    });

    expect(result.ok).toBe(true);
    expect(result.repairUsed).toBe(true);
    expect(result.runtimeErrors).toEqual(["ReferenceError: x is not defined"]);
    expect(repair).toHaveBeenCalled();
    expect(build).toHaveBeenCalled();
    expect(writeArtifact).toHaveBeenCalled();
  });

  it("returns ok=false when the rebuild fails after repair", async () => {
    const repair = vi.fn().mockResolvedValue({
      files: [{ content: "still-broken", path: "src/main.ts" }],
    });
    const build = vi.fn().mockResolvedValue({ ok: false });

    const result = await runRuntimeSelfHeal({
      artifactRef: "a1",
      deps: {
        build,
        captureErrors: vi.fn().mockResolvedValue(["Error: crash"]),
        repair,
        supervisor: noOpSupervisor as never,
      },
      files: [],
      projectId: "p1",
      schema: { businessName: "Test" } as never,
    });

    expect(result.ok).toBe(false);
    expect(result.repairUsed).toBe(true);
  });
});
