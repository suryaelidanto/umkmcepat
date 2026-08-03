// src/lib/projects/build-handoffs.ts
// Durable handoff read/selection helpers. Handoff rows are immutable
// contract/plan pairs; execution status lives on attempts/builds, never here.
import { prisma } from "@/lib/prisma";

export type ActiveHandoff = {
  id: string;
  contractHash: string;
  planHash: string;
  contractRevision: number;
  planRevision: number;
};

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
