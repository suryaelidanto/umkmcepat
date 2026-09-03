// src/lib/projects/build-handoff-acceptance.ts
import { prisma } from "@/lib/prisma";

export type AcceptHandoffInput = {
  projectId: string;
  userId: string;
  handoffId: string;
  reviewHash: string;
  generationEngine: string;
  clientIdempotencyKey: string;
  attemptId: string;
};

export type AcceptHandoffResult =
  | { created: true; attemptId: string }
  | { created: false; existingAttemptId: string };

export async function acceptHandoffAndCreateAttempt(
  input: AcceptHandoffInput,
): Promise<AcceptHandoffResult> {
  const handoff = await prisma.projectBuildHandoff.findUnique({
    where: { id: input.handoffId },
    select: { status: true, reviewHash: true, projectId: true, userId: true },
  });
  if (
    !handoff ||
    handoff.projectId !== input.projectId ||
    handoff.userId !== input.userId ||
    (handoff.status !== "draft" && handoff.status !== "accepted")
  ) {
    throw new Error("handoff not found");
  }
  if (handoff.reviewHash !== input.reviewHash) {
    throw new Error("review hash mismatch");
  }

  const existing = await prisma.projectEditAttempt.findFirst({
    where: {
      projectId: input.projectId,
      userId: input.userId,
      annotations: {
        path: ["clientIdempotencyKey"],
        equals: input.clientIdempotencyKey,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return { created: false, existingAttemptId: existing.id };
  }

  const created = await prisma.projectEditAttempt.create({
    data: {
      id: input.attemptId,
      projectId: input.projectId,
      userId: input.userId,
      handoffId: input.handoffId,
      kind: "generate",
      instruction: "Generate project from the accepted contract/plan handoff.",
      status: "generating",
      annotations: { clientIdempotencyKey: input.clientIdempotencyKey },
    },
    select: { id: true },
  });

  if (handoff.status === "draft") {
    await prisma.projectBuildHandoff.update({
      where: { id: input.handoffId },
      data: { status: "accepted", acceptedAt: new Date() },
    });
  }

  return { created: true, attemptId: created.id };
}
