import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    project: { findUnique: vi.fn() },
    projectBuildHandoff: { findUnique: vi.fn(), update: vi.fn() },
    projectEditAttempt: { findFirst: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { acceptHandoffAndCreateAttempt } from "./build-handoff-acceptance";
import { resolveGenerateMode } from "./resolve-generate-mode";

describe("resolveGenerateMode (contract-v1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reuses the accepted handoff on retry instead of re-entering first_generate", () => {
    const mode = resolveGenerateMode({
      requestedMode: "retry_build",
      hasPersistedSource: true,
      generationEngine: "contract-v1",
      hasAcceptedHandoff: true,
    });
    expect(mode).toBe("retry_build");
  });

  it("never re-enters first_generate when a contract handoff is already accepted", () => {
    const mode = resolveGenerateMode({
      requestedMode: "first_generate",
      hasPersistedSource: false,
      generationEngine: "contract-v1",
      hasAcceptedHandoff: true,
    });
    expect(mode).toBe("retry_build");
  });

  it("keeps legacy behavior when engine is legacy-v1", () => {
    expect(
      resolveGenerateMode({
        requestedMode: "first_generate",
        hasPersistedSource: false,
        generationEngine: "legacy-v1",
        hasAcceptedHandoff: false,
      }),
    ).toBe("first_generate");
  });
});

describe("acceptHandoffAndCreateAttempt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a stale review hash before creating any attempt", async () => {
    prismaMock.projectBuildHandoff.findUnique.mockResolvedValue({
      id: "h1",
      projectId: "p1",
      userId: "u1",
      status: "draft",
      reviewHash: "current",
    });
    await expect(
      acceptHandoffAndCreateAttempt({
        projectId: "p1",
        userId: "u1",
        handoffId: "h1",
        reviewHash: "stale",
        generationEngine: "contract-v1",
        clientIdempotencyKey: "r1",
        attemptId: "build_a",
      }),
    ).rejects.toThrow("review hash mismatch");
    expect(prismaMock.projectEditAttempt.create).not.toHaveBeenCalled();
  });

  it("returns an existing attempt when the idempotency key is replayed", async () => {
    prismaMock.projectBuildHandoff.findUnique.mockResolvedValue({
      id: "h1",
      projectId: "p1",
      userId: "u1",
      status: "accepted",
      reviewHash: "current",
    });
    prismaMock.projectEditAttempt.findFirst.mockResolvedValue({
      id: "existing-attempt",
      status: "building",
    });
    const result = await acceptHandoffAndCreateAttempt({
      projectId: "p1",
      userId: "u1",
      handoffId: "h1",
      reviewHash: "current",
      generationEngine: "contract-v1",
      clientIdempotencyKey: "r1",
      attemptId: "build_new",
    });
    expect(result.created).toBe(false);
    if (!result.created) {
      expect(result.existingAttemptId).toBe("existing-attempt");
    }
  });

  it("creates an attempt for a fresh idempotency key against a draft handoff", async () => {
    prismaMock.projectBuildHandoff.findUnique.mockResolvedValue({
      id: "h1",
      projectId: "p1",
      userId: "u1",
      status: "draft",
      reviewHash: "current",
    });
    prismaMock.projectEditAttempt.findFirst.mockResolvedValue(null);
    prismaMock.projectEditAttempt.create.mockResolvedValue({ id: "build_new" });
    prismaMock.projectBuildHandoff.update.mockResolvedValue({ id: "h1" });
    prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));

    const result = await acceptHandoffAndCreateAttempt({
      projectId: "p1",
      userId: "u1",
      handoffId: "h1",
      reviewHash: "current",
      generationEngine: "contract-v1",
      clientIdempotencyKey: "r1",
      attemptId: "build_new",
    });
    expect(result.created).toBe(true);
    if (result.created) {
      expect(result.attemptId).toBe("build_new");
    }
    expect(prismaMock.projectBuildHandoff.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "accepted" }),
      }),
    );
  });
});
