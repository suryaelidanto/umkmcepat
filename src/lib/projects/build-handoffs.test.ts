import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    projectBuildHandoff: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    projectEditAttempt: {
      findUnique: vi.fn(),
    },
    project: {
      update: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    projectSnapshot: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  loadAcceptedHandoffForAttempt,
  loadActiveHandoff,
  selectQualifiedHandoff,
} from "./build-handoffs";
import { hashBuildContract, hashBuildPlan } from "./build-hash";

import type { BuildContractV1 } from "./build-contract";
import type { BuildPlanV1 } from "./build-plan";

function acceptedPair(): {
  contract: BuildContractV1;
  plan: BuildPlanV1;
} {
  const contract: BuildContractV1 = {
    schemaVersion: 1,
    revision: 1,
    contentHash: "",
    identity: { businessName: "Kopi Sela", businessType: "fnb" },
    facts: [],
    decisions: [],
    visitorJobs: [
      { id: "job-order", goal: "Memesan kopi", priority: "primary" },
    ],
    ctaIntents: [{ id: "cta-order", kind: "browse", label: "Lihat menu" }],
    hardRequirements: [],
    prohibitedClaims: [],
    preferences: {
      visualDirection: "hangat",
      tone: null,
      density: null,
      motion: null,
    },
    assets: [],
    blockers: [],
    omissions: [],
  };
  contract.contentHash = hashBuildContract(contract);
  const plan: BuildPlanV1 = {
    schemaVersion: 1,
    revision: 1,
    contractHash: contract.contentHash,
    contentHash: "",
    appKind: "landing",
    archetype: "fnb-menu",
    pages: [
      {
        id: "home",
        path: "/",
        title: "Kopi Sela",
        purpose: "Membantu pelanggan memilih dan memesan kopi.",
        visitorJobIds: ["job-order"],
        requiredFactIds: [],
        sections: [
          {
            id: "menu",
            purpose: "Menampilkan pilihan kopi.",
            surfaceIntent: "contained",
            requiredFactIds: [],
            requiredAssetIds: [],
          },
        ],
      },
    ],
    navigation: [],
    capabilities: ["catalog"],
    artDirection: {
      businessSpecificReference: "menu kedai yang mudah dipindai",
      antiReferences: ["generic card grid"],
      imageStrategy: "typographic",
      fontStrategy: "system_stack",
    },
  };
  plan.contentHash = hashBuildPlan(plan);
  return { contract, plan };
}

describe("loadAcceptedHandoffForAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and validates the immutable accepted handoff", async () => {
    const { contract, plan } = acceptedPair();
    prismaMock.projectEditAttempt.findUnique.mockResolvedValue({
      id: "attempt-1",
      projectId: "project-1",
      userId: "user-1",
      handoff: {
        id: "handoff-1",
        projectId: "project-1",
        userId: "user-1",
        status: "accepted",
        contract,
        plan,
        contractHash: contract.contentHash,
        planHash: plan.contentHash,
        contractRevision: 1,
        planRevision: 1,
      },
    });

    await expect(
      loadAcceptedHandoffForAttempt({
        attemptId: "attempt-1",
        projectId: "project-1",
        userId: "user-1",
      }),
    ).resolves.toMatchObject({
      id: "handoff-1",
      contract,
      plan,
      contractHash: contract.contentHash,
      planHash: plan.contentHash,
    });
  });

  it.each([
    ["missing", null, "accepted handoff missing"],
    [
      "wrong owner",
      { projectId: "project-1", userId: "other", handoff: null },
      "accepted handoff ownership mismatch",
    ],
  ])("rejects %s", async (_label, row, message) => {
    prismaMock.projectEditAttempt.findUnique.mockResolvedValue(row);
    await expect(
      loadAcceptedHandoffForAttempt({
        attemptId: "attempt-1",
        projectId: "project-1",
        userId: "user-1",
      }),
    ).rejects.toThrow(message);
  });

  it("rejects a non-accepted handoff", async () => {
    const { contract, plan } = acceptedPair();
    prismaMock.projectEditAttempt.findUnique.mockResolvedValue({
      projectId: "project-1",
      userId: "user-1",
      handoff: {
        id: "handoff-1",
        projectId: "project-1",
        userId: "user-1",
        status: "draft",
        contract,
        plan,
      },
    });
    await expect(
      loadAcceptedHandoffForAttempt({
        attemptId: "attempt-1",
        projectId: "project-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("accepted handoff invalid");
  });

  it("rejects canonical hash drift", async () => {
    const { contract, plan } = acceptedPair();
    prismaMock.projectEditAttempt.findUnique.mockResolvedValue({
      projectId: "project-1",
      userId: "user-1",
      handoff: {
        id: "handoff-1",
        projectId: "project-1",
        userId: "user-1",
        status: "accepted",
        contract,
        plan,
        contractHash: "0".repeat(64),
        planHash: plan.contentHash,
        contractRevision: 1,
        planRevision: 1,
      },
    });
    await expect(
      loadAcceptedHandoffForAttempt({
        attemptId: "attempt-1",
        projectId: "project-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("accepted handoff hash mismatch");
  });
});

describe("loadActiveHandoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the project has no active handoff", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      activeHandoffId: null,
    });
    const result = await loadActiveHandoff("project-1");
    expect(result).toBeNull();
  });

  it("loads the active handoff by id", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      activeHandoffId: "handoff-1",
    });
    prismaMock.projectBuildHandoff.findUnique.mockResolvedValue({
      id: "handoff-1",
      contractHash: "a",
      planHash: "b",
    });
    const result = await loadActiveHandoff("project-1");
    expect(result).toMatchObject({
      id: "handoff-1",
      contractHash: "a",
      planHash: "b",
    });
    expect(prismaMock.projectBuildHandoff.findUnique).toHaveBeenCalledWith({
      where: { id: "handoff-1" },
    });
  });
});

describe("selectQualifiedHandoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects the snapshot and supersedes the prior active handoff atomically", async () => {
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(prismaMock),
    );
    prismaMock.project.findUnique.mockResolvedValue({
      activeOperationToken: "op-1",
      activeHandoffId: "handoff-1",
    });
    await selectQualifiedHandoff({
      projectId: "project-1",
      handoffId: "handoff-2",
      snapshotId: "snap-2",
      operationId: "op-1",
    });
    expect(prismaMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "project-1" } }),
    );
  });
});
