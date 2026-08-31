import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    projectBuildHandoff: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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
  createDraftHandoff,
  loadAcceptedHandoffForAttempt,
  loadActiveHandoff,
  selectQualifiedHandoff,
} from "./build-handoffs";
import { hashBuildContract, hashBuildPlan } from "./build-hash";
import { parseCanonicalBrief } from "./canonical-brief";
import {
  hashCanonicalBrief,
  hashCanonicalBriefContent,
} from "./canonical-brief-hash";

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
    pages: [
      {
        id: "home",
        path: "/",
        title: "Kopi Sela",
        purpose: "Membantu pelanggan memilih dan memesan kopi.",
        visitorJobIds: ["job-order"],
        requiredFactIds: [],
      },
    ],
    navigation: [],
    capabilities: ["catalog"],
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
    const briefSnapshot = parseCanonicalBrief({
      businessName: "Kopi Sela",
      productOrService: [{ name: "Kopi", isPrimary: true }],
      targetCustomer: "Pekerja",
      contactOrCta: "Lihat menu",
      stylePreference: "hangat",
    });
    const briefHash = hashCanonicalBrief(briefSnapshot);
    prismaMock.projectEditAttempt.findUnique.mockResolvedValue({
      id: "attempt-1",
      projectId: "project-1",
      userId: "user-1",
      handoff: {
        id: "handoff-1",
        projectId: "project-1",
        userId: "user-1",
        status: "accepted",
        briefSnapshot,
        briefHash,
        briefRevision: 2,
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
      briefSnapshot,
      briefHash,
      briefRevision: 2,
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

  it("rejects a new accepted handoff without a canonical snapshot", async () => {
    const { contract, plan } = acceptedPair();
    prismaMock.projectEditAttempt.findUnique.mockResolvedValue({
      projectId: "project-1",
      userId: "user-1",
      handoff: {
        id: "handoff-1",
        projectId: "project-1",
        userId: "user-1",
        status: "accepted",
        briefSnapshot: null,
        briefHash: null,
        briefRevision: null,
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
    ).rejects.toThrow("accepted handoff brief snapshot missing");
  });

  it("rejects canonical brief hash drift", async () => {
    const { contract, plan } = acceptedPair();
    const briefSnapshot = parseCanonicalBrief({ businessName: "Kopi Sela" });
    prismaMock.projectEditAttempt.findUnique.mockResolvedValue({
      projectId: "project-1",
      userId: "user-1",
      handoff: {
        id: "handoff-1",
        projectId: "project-1",
        userId: "user-1",
        status: "accepted",
        briefSnapshot,
        briefHash: "0".repeat(64),
        briefRevision: 2,
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
    ).rejects.toThrow("accepted handoff brief hash mismatch");
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
    const briefSnapshot = parseCanonicalBrief({ businessName: "Kopi Sela" });
    prismaMock.projectEditAttempt.findUnique.mockResolvedValue({
      projectId: "project-1",
      userId: "user-1",
      handoff: {
        id: "handoff-1",
        projectId: "project-1",
        userId: "user-1",
        status: "accepted",
        briefSnapshot,
        briefHash: hashCanonicalBrief(briefSnapshot),
        briefRevision: 2,
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

describe("createDraftHandoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the canonical brief snapshot and its hash", async () => {
    const { contract, plan } = acceptedPair();
    const briefSnapshot = parseCanonicalBrief({
      businessName: "Kopi Sela",
      productOrService: [{ name: "Kopi", isPrimary: true }],
    });
    const briefHash = hashCanonicalBrief(briefSnapshot);
    prismaMock.projectBuildHandoff.findUnique.mockResolvedValue(null);
    prismaMock.projectBuildHandoff.create.mockResolvedValue({
      id: "handoff-1",
    });

    await createDraftHandoff({
      projectId: "project-1",
      userId: "user-1",
      engine: "contract-v1",
      briefSnapshot,
      briefHash,
      briefRevision: 2,
      contract,
      plan,
      contractHash: contract.contentHash,
      planHash: plan.contentHash,
      reviewItems: [],
      reviewHash: "a".repeat(64),
      contractRevision: 1,
      planRevision: 1,
    });

    expect(prismaMock.projectBuildHandoff.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          briefSnapshot,
          briefHash,
          briefRevision: 2,
        }),
      }),
    );
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

  it("loads the active handoff only when it belongs to the project", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      activeHandoffId: "handoff-1",
    });
    prismaMock.projectBuildHandoff.findFirst.mockResolvedValue({
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
    expect(prismaMock.projectBuildHandoff.findFirst).toHaveBeenCalledWith({
      where: { id: "handoff-1", projectId: "project-1" },
    });
  });

  it("returns null when the active handoff pointer targets another project", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      activeHandoffId: "handoff-1",
    });
    prismaMock.projectBuildHandoff.findFirst.mockResolvedValue(null);

    await expect(loadActiveHandoff("project-1")).resolves.toBeNull();
    expect(prismaMock.projectBuildHandoff.findFirst).toHaveBeenCalledWith({
      where: { id: "handoff-1", projectId: "project-1" },
    });
  });
});

describe("selectQualifiedHandoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the stable brief content hash for active handoff comparisons", async () => {
    const briefSnapshot = parseCanonicalBrief({
      version: 2,
      business: { name: "Toko", type: "Retail", category: "retail" },
      offers: [{ name: "Produk", isPrimary: true }],
      factLedger: {
        version: 1,
        entries: [
          {
            id: "offers-primary",
            field: "offers",
            label: "Produk",
            value: "Produk",
            state: "owner_confirmed",
            source: "owner",
            sourceTurnId: "turn-a",
          },
        ],
      },
      discussionContext: {
        version: 1,
        messages: [],
        summary: { text: "", compactedMessageCount: 0 },
        memoryFacts: { facts: [], decisions: [], preferences: [] },
        capturedAt: "2026-08-29T00:00:00.000Z",
      },
    });
    prismaMock.project.findUnique.mockResolvedValue({
      activeHandoffId: "handoff-1",
    });
    prismaMock.projectBuildHandoff.findFirst.mockResolvedValue({
      id: "handoff-1",
      briefHash: hashCanonicalBrief(briefSnapshot),
      briefSnapshot,
      contractHash: "a",
      planHash: "b",
    });

    const result = await loadActiveHandoff("project-1");

    expect(result?.briefHash).toBe(hashCanonicalBriefContent(briefSnapshot));
  });

  it("selects the snapshot and supersedes the prior active handoff atomically", async () => {
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(prismaMock),
    );
    prismaMock.project.findUnique.mockResolvedValue({
      activeOperationToken: "op-1",
      activeHandoffId: "handoff-1",
    });
    prismaMock.projectBuildHandoff.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.projectSnapshot.updateMany.mockResolvedValue({ count: 1 });
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

  it("rejects a handoff from another project before changing the active pointer", async () => {
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(prismaMock),
    );
    prismaMock.project.findUnique.mockResolvedValue({
      activeOperationToken: "op-1",
      activeHandoffId: "handoff-1",
    });
    prismaMock.projectBuildHandoff.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      selectQualifiedHandoff({
        projectId: "project-1",
        handoffId: "handoff-2",
        snapshotId: "snap-2",
        operationId: "op-1",
      }),
    ).rejects.toThrow("handoff does not belong to project");
    expect(prismaMock.project.update).not.toHaveBeenCalled();
    expect(prismaMock.projectSnapshot.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a snapshot from another project before changing the active pointer", async () => {
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(prismaMock),
    );
    prismaMock.project.findUnique.mockResolvedValue({
      activeOperationToken: "op-1",
      activeHandoffId: "handoff-1",
    });
    prismaMock.projectBuildHandoff.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.projectSnapshot.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      selectQualifiedHandoff({
        projectId: "project-1",
        handoffId: "handoff-2",
        snapshotId: "snap-2",
        operationId: "op-1",
      }),
    ).rejects.toThrow("snapshot does not belong to project");
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });
});
