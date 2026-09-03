import { describe, expect, it, vi } from "vitest";

const {
  authMock,
  checkEnergyMock,
  enqueueAttemptJobMock,
  projectBuildCheckpointFindFirstMock,
  projectDeploymentFindManyMock,
  projectEditAttemptCreateMock,
  projectFindFirstMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(async () => ({ user: { id: "user-1" } })),
  checkEnergyMock: vi.fn(async () => ({ allowed: true, remaining: 100_000 })),
  enqueueAttemptJobMock: vi.fn(),
  projectBuildCheckpointFindFirstMock: vi.fn(),
  projectDeploymentFindManyMock: vi.fn(),
  projectEditAttemptCreateMock: vi.fn(),
  projectFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/config/app-settings", () => ({
  getSetting: vi.fn(async () => true),
}));
vi.mock("@/lib/config/config", () => ({
  isGeneratedBuildExecutionEnabled: vi.fn(() => true),
}));
vi.mock("@/lib/payment/user-credits", () => ({
  checkEnergy: checkEnergyMock,
  getEnergyConfig: vi.fn(() => ({ minEdit: 10_000 })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: projectFindFirstMock },
    projectBuildCheckpoint: {
      findFirst: projectBuildCheckpointFindFirstMock,
    },
    projectDeployment: { findMany: projectDeploymentFindManyMock },
    projectEditAttempt: { create: projectEditAttemptCreateMock },
  },
}));
vi.mock("@/lib/projects/attempt-queue", () => ({
  enqueueAttemptJob: enqueueAttemptJobMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => null),
}));

import { handleVisualEditPost } from "@/routes/api.projects.$id.visual-edit";

describe("visual edit scope gate", () => {
  it("returns one clarification and queues zero jobs for an ambiguous request", async () => {
    projectFindFirstMock.mockResolvedValue({
      brief: null,
      buildStatus: "passed",
      chatMessages: [],
      chatSummary: null,
      generationEngine: "agentic",
      id: "project-1",
      memoryFacts: null,
      prompt: "Buat website laundry",
      siteSchema: null,
      status: "ready",
    });

    const response = await handleVisualEditPost(
      new Request("http://localhost/api/projects/project-1/visual-edit", {
        method: "POST",
        body: JSON.stringify({ instruction: "Tolong bikin lebih bagus." }),
      }),
      "project-1",
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "edit_scope_clarification_required",
    });
    expect(enqueueAttemptJobMock).not.toHaveBeenCalled();
    expect(projectDeploymentFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects a validly scoped edit without a successful checkpoint before creating an attempt", async () => {
    projectFindFirstMock.mockResolvedValue({
      brief: null,
      buildStatus: "passed",
      chatMessages: [],
      chatSummary: null,
      generationEngine: "agentic",
      id: "project-1",
      memoryFacts: null,
      prompt: "Buat website laundry",
      siteSchema: null,
      status: "ready",
    });
    projectDeploymentFindManyMock.mockResolvedValue([
      {
        build: {
          artifactRef: "project-artifact:s3:dist:build-1",
          createdAt: new Date("2026-09-02T00:00:00Z"),
          id: "build-1",
          projectId: "project-1",
          snapshot: { id: "snapshot-1", projectId: "project-1" },
          snapshotId: "snapshot-1",
          status: "succeeded",
          updatedAt: new Date("2026-09-02T00:00:00Z"),
        },
        buildId: "build-1",
        createdAt: new Date("2026-09-02T00:00:00Z"),
        id: "deployment-1",
        kind: "preview",
        projectId: "project-1",
        snapshot: {
          files: [
            {
              content: "export default function Home() { return null; }",
              path: "src/routes/index.tsx",
            },
          ],
          id: "snapshot-1",
          projectId: "project-1",
          sourceRef: null,
        },
        snapshotId: "snapshot-1",
        status: "running",
        updatedAt: new Date("2026-09-02T00:00:00Z"),
      },
    ]);
    projectBuildCheckpointFindFirstMock.mockResolvedValue(null);

    const response = await handleVisualEditPost(
      new Request("http://localhost/api/projects/project-1/visual-edit", {
        method: "POST",
        body: JSON.stringify({ instruction: "Ubah warna utama saja." }),
      }),
      "project-1",
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "edit_plan_checkpoint_required",
    });
    expect(projectEditAttemptCreateMock).not.toHaveBeenCalled();
    expect(enqueueAttemptJobMock).not.toHaveBeenCalled();
  });
});
