// src/lib/projects/build-handoffs.ts
// Durable handoff read/selection helpers. Handoff rows are immutable
// contract/plan pairs; execution status lives on attempts/builds, never here.
import { prisma } from "@/lib/prisma";
import {
  parseBuildContract,
  type BuildContractV1,
} from "@/lib/projects/build-contract";
import { hashBuildContract, hashBuildPlan } from "@/lib/projects/build-hash";
import {
  parseBuildPlan,
  type BuildPlanV1,
  validatePlanAgainstContract,
} from "@/lib/projects/build-plan";
import {
  hashCanonicalBrief,
  parseCanonicalBrief,
  type ProjectBriefV2,
} from "@/lib/projects/canonical-brief";

export type ActiveHandoff = {
  id: string;
  contractHash: string;
  planHash: string;
  contractRevision: number;
  planRevision: number;
  creativeDirection?: string | null;
  creativeDirectionHash?: string | null;
};

export type AcceptedBuildHandoff = {
  id: string;
  briefSnapshot: ProjectBriefV2;
  briefHash: string;
  briefRevision: 2;
  contract: BuildContractV1;
  plan: BuildPlanV1;
  contractHash: string;
  planHash: string;
  contractRevision: number;
  planRevision: number;
  creativeDirection: string | null;
};

export type CreateHandoffInput = {
  projectId: string;
  userId: string;
  engine: string;
  briefSnapshot: ProjectBriefV2;
  briefHash: string;
  briefRevision: 2;
  contract: unknown;
  plan: unknown;
  contractHash: string;
  planHash: string;
  reviewItems: unknown;
  reviewHash: string;
  contractRevision: number;
  planRevision: number;
  creativeDirection?: string | null;
  creativeDirectionHash?: string | null;
};

export async function loadAcceptedHandoffForAttempt(input: {
  attemptId: string;
  projectId: string;
  userId: string;
}): Promise<AcceptedBuildHandoff> {
  const attempt = await prisma.projectEditAttempt.findUnique({
    where: { id: input.attemptId },
    select: {
      projectId: true,
      userId: true,
      handoff: true,
    },
  });
  if (!attempt) {
    throw new Error("accepted handoff missing");
  }
  if (
    attempt.projectId !== input.projectId ||
    attempt.userId !== input.userId
  ) {
    throw new Error("accepted handoff ownership mismatch");
  }
  const handoff = attempt.handoff;
  if (
    !handoff ||
    handoff.projectId !== input.projectId ||
    handoff.userId !== input.userId ||
    handoff.status !== "accepted"
  ) {
    throw new Error("accepted handoff invalid");
  }
  const rawBrief = asRecord(handoff.briefSnapshot);
  if (
    !rawBrief ||
    rawBrief.version !== 2 ||
    handoff.briefRevision !== 2 ||
    typeof handoff.briefHash !== "string"
  ) {
    throw new Error("accepted handoff brief snapshot missing");
  }
  // Idempotent parse: if already canonical V2, hash directly from the stored
  // canonical brief snapshot rather than re-normalizing fields that mutate
  // categories/order.
  const briefSnapshot = parseCanonicalBrief(rawBrief);
  const briefHash = hashCanonicalBrief(rawBrief as ProjectBriefV2);
  if (
    handoff.briefHash !== briefHash &&
    handoff.briefHash !== hashCanonicalBrief(briefSnapshot)
  ) {
    throw new Error("accepted handoff brief hash mismatch");
  }
  const parsedContract = parseBuildContract(handoff.contract);
  const parsedPlan = parseBuildPlan(handoff.plan);
  if (!parsedContract.ok || !parsedPlan.ok) {
    throw new Error("accepted handoff invalid");
  }
  const contract = parsedContract.value;
  const plan = parsedPlan.value;
  const contractHash = hashBuildContract(contract);
  const planHash = hashBuildPlan(plan);
  if (
    contract.contentHash !== contractHash ||
    plan.contentHash !== planHash ||
    handoff.contractHash !== contractHash ||
    handoff.planHash !== planHash
  ) {
    throw new Error("accepted handoff hash mismatch");
  }
  if (!validatePlanAgainstContract(plan, contract).ok) {
    throw new Error("accepted handoff invalid");
  }
  return {
    id: handoff.id,
    briefSnapshot,
    briefHash,
    briefRevision: 2,
    contract,
    plan,
    contractHash,
    planHash,
    contractRevision: handoff.contractRevision,
    planRevision: handoff.planRevision,
    creativeDirection: handoff.creativeDirection ?? null,
  };
}

/** Create (or reuse) an immutable draft handoff for a contract/plan pair.
 * Idempotent on the revision-unique constraint; equal semantic content at a
 * later revision creates a distinct row. Returns the stored review hash and
 * review items so callers always emit a card that matches the row — never a
 * freshly-computed hash that could diverge from the reused row. */
export async function createDraftHandoff(input: CreateHandoffInput): Promise<{
  id: string;
  reused: boolean;
  reviewHash: string;
  reviewItems: unknown;
}> {
  const existing = await prisma.projectBuildHandoff.findUnique({
    where: {
      projectId_contractRevision_planRevision: {
        projectId: input.projectId,
        contractRevision: input.contractRevision,
        planRevision: input.planRevision,
      },
    },
    select: {
      id: true,
      contractHash: true,
      planHash: true,
      reviewHash: true,
      reviewItems: true,
    },
  });
  if (existing) {
    const sameContent =
      existing.contractHash === input.contractHash &&
      existing.planHash === input.planHash;
    if (sameContent) {
      return {
        id: existing.id,
        reused: true,
        reviewHash: existing.reviewHash,
        reviewItems: existing.reviewItems,
      };
    }
    // Content changed at the same nominal revision: bump to the next
    // contract revision instead of silently reusing a stale immutable row.
    const latest = await prisma.projectBuildHandoff.findFirst({
      where: { projectId: input.projectId },
      orderBy: { contractRevision: "desc" },
      select: { contractRevision: true },
    });
    const nextRevision = (latest?.contractRevision ?? 0) + 1;
    const created = await prisma.projectBuildHandoff.create({
      data: {
        projectId: input.projectId,
        userId: input.userId,
        engine: input.engine,
        briefSnapshot: input.briefSnapshot as object,
        briefHash: input.briefHash,
        briefRevision: input.briefRevision,
        contract: input.contract as object,
        plan: input.plan as object,
        contractHash: input.contractHash,
        planHash: input.planHash,
        reviewItems: input.reviewItems as object,
        reviewHash: input.reviewHash,
        contractRevision: nextRevision,
        planRevision: input.planRevision,
        creativeDirection: input.creativeDirection ?? null,
        creativeDirectionHash: input.creativeDirectionHash ?? null,
      },
      select: { id: true },
    });
    return {
      id: created.id,
      reused: false,
      reviewHash: input.reviewHash,
      reviewItems: input.reviewItems,
    };
  }
  const created = await prisma.projectBuildHandoff.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      engine: input.engine,
      briefSnapshot: input.briefSnapshot as object,
      briefHash: input.briefHash,
      briefRevision: input.briefRevision,
      contract: input.contract as object,
      plan: input.plan as object,
      contractHash: input.contractHash,
      planHash: input.planHash,
      reviewItems: input.reviewItems as object,
      reviewHash: input.reviewHash,
      contractRevision: input.contractRevision,
      planRevision: input.planRevision,
      creativeDirection: input.creativeDirection ?? null,
      creativeDirectionHash: input.creativeDirectionHash ?? null,
    },
    select: { id: true },
  });
  return {
    id: created.id,
    reused: false,
    reviewHash: input.reviewHash,
    reviewItems: input.reviewItems,
  };
}

/** Resolve the selected contract-v1 deployment's handoff for a project. */
export async function loadActiveHandoff(
  projectId: string,
): Promise<ActiveHandoff | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { activeHandoffId: true },
  });
  if (!project?.activeHandoffId) {
    return null;
  }
  const handoff = await prisma.projectBuildHandoff.findUnique({
    where: { id: project.activeHandoffId },
  });
  if (!handoff) {
    return null;
  }
  return {
    id: handoff.id,
    contractHash: handoff.contractHash,
    planHash: handoff.planHash,
    contractRevision: handoff.contractRevision,
    planRevision: handoff.planRevision,
  };
}

/** A contract-v1 snapshot is directly restorable only when its recorded
 * contract/plan hashes match the project's active handoff. Otherwise restoring
 * it is a structural change requiring a new reviewed handoff. */
export async function isSnapshotRestorableAgainstActiveHandoff(input: {
  projectId: string;
  snapshotMetadata: unknown;
}): Promise<boolean> {
  const active = await loadActiveHandoff(input.projectId);
  if (!active) {
    return true;
  }
  const meta = asRecord(input.snapshotMetadata);
  if (!meta) {
    return false;
  }
  const generation = asRecord(meta.generation);
  const contractHash =
    generation && typeof generation.contractHash === "string"
      ? generation.contractHash
      : null;
  const planHash =
    generation && typeof generation.planHash === "string"
      ? generation.planHash
      : null;
  if (typeof contractHash !== "string" || typeof planHash !== "string") {
    return false;
  }
  return contractHash === active.contractHash && planHash === active.planHash;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Atomically select a qualified candidate's handoff as the project's active
 * handoff. Verifies the operation lease, updates the project, and supersedes
 * the previously active handoff. A failed candidate must never reach here.
 */
export async function selectQualifiedHandoff(input: {
  projectId: string;
  handoffId: string;
  snapshotId: string;
  operationId: string;
}): Promise<void> {
  const { projectId, handoffId, snapshotId, operationId } = input;
  await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        activeOperationToken: true,
        activeHandoffId: true,
      },
    });
    if (!project || project.activeOperationToken !== operationId) {
      throw new Error("operation lease mismatch");
    }
    await tx.projectBuildHandoff.updateMany({
      where: { id: handoffId, projectId },
      data: { status: "accepted" },
    });
    await tx.project.update({
      where: { id: projectId },
      data: { activeHandoffId: handoffId },
    });
    // Select the candidate's snapshot as the last-known-good deployment.
    await tx.projectSnapshot.updateMany({
      where: { id: snapshotId, projectId },
      data: { metadata: { selected: true } },
    });
    const prior = project.activeHandoffId;
    if (prior && prior !== handoffId) {
      await tx.projectBuildHandoff.updateMany({
        where: { id: prior, projectId },
        data: { status: "superseded" },
      });
    }
  });
}
