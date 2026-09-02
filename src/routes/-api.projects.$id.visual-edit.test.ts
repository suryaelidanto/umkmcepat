import { describe, expect, it, vi } from "vitest";

const {
  authMock,
  checkEnergyMock,
  enqueueAttemptJobMock,
  projectDeploymentFindManyMock,
  projectFindFirstMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(async () => ({ user: { id: "user-1" } })),
  checkEnergyMock: vi.fn(async () => ({ allowed: true, remaining: 100_000 })),
  enqueueAttemptJobMock: vi.fn(),
  projectDeploymentFindManyMock: vi.fn(),
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
    projectDeployment: { findMany: projectDeploymentFindManyMock },
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
});
