import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { isGeneratedBuildExecutionEnabled } from "@/lib/config";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { enqueueAttemptJob } from "@/lib/projects/attempt-queue";
import {
  createReadStreamFromChannel,
  publishBuildProgress,
} from "@/lib/projects/build-attempt-pubsub";
import { acceptHandoffAndCreateAttempt } from "@/lib/projects/build-handoff-acceptance";
import { loadActiveHandoff } from "@/lib/projects/build-handoffs";
import { loadPersistedProjectSourceFiles } from "@/lib/projects/load-persisted-project-source";
import {
  claimProjectOperation,
  finalizeProjectOperation,
} from "@/lib/projects/project-operation";
import { resolveGenerateMode } from "@/lib/projects/resolve-generate-mode";
import {
  type ProjectBuildStatus,
  type ProjectSnapshotSourceType,
} from "@/lib/projects/runtime-types";
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkEnergy, getEnergyConfig } from "@/lib/user-credits";
import { mapToUserFacingError } from "@/lib/user-facing-error";

export const Route = createFileRoute("/api/projects/$id/generate")({
  server: {
    handlers: {
      POST: ({ request, params }) => handleGeneratePost(request, params.id),
    },
  },
});

export async function handleGeneratePost(request: Request, routeId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  let requestedMode: "first_generate" | "retry_build" = "first_generate";
  let contractHandoffId: string | undefined;
  let contractReviewHash: string | undefined;
  let clientIdempotencyKey: string | undefined;
  try {
    const body = (await request.json()) as {
      mode?: string;
      handoffId?: string;
      reviewHash?: string;
      idempotencyKey?: string;
    };
    if (body?.mode === "retry_build") {
      requestedMode = "retry_build";
    }
    contractHandoffId = body?.handoffId;
    contractReviewHash = body?.reviewHash;
    clientIdempotencyKey = body?.idempotencyKey;
  } catch {
    // empty body = first generate
  }

  const userId = session.user.id;

  // Worker runs via BullMQ (survives browser disconnect). Cancel via
  // POST /api/projects/$id/cancel which finalizes the operation lease.

  const energy = await checkEnergy(userId, getEnergyConfig().minBuild);
  if (!energy.allowed) {
    return Response.json(
      {
        message: "Energi kamu sudah habis. Tambah energi untuk lanjut.",
        code: "energy_exhausted",
        remaining: energy.remaining,
      },
      { status: 429 },
    );
  }

  const rateLimitResponse = await checkRateLimit(request, "build", userId);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!isGeneratedBuildExecutionEnabled()) {
    return Response.json(
      {
        code: "generated_build_execution_unavailable",
        message:
          "Build baru sedang dinonaktifkan sementara. Tampilan terakhir tetap aman.",
      },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }

  const id = routeId;
  devLog("generate", "request", { projectId: id, userId });
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: {
      buildStatus: true,
      id: true,
      prompt: true,
      status: true,
      generationEngine: true,
    },
  });

  devLog("generate", "project.loaded", {
    buildStatus: project?.buildStatus,
    projectId: id,
    status: project?.status,
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  await markStaleProjectBuilds(project.id);

  const latestProjectState = await prisma.project.findFirst({
    where: { id: project.id, userId },
    select: { buildStatus: true, status: true },
  });

  if (
    latestProjectState?.status === "building" ||
    latestProjectState?.status === "stopping" ||
    latestProjectState?.buildStatus === "running"
  ) {
    return Response.json(
      {
        code: "project_build_in_progress",
        message: "Build masih berjalan untuk proyek ini.",
      },
      { status: 409 },
    );
  }

  // Contract-v1 must present valid handoff proof before any operation is
  // claimed. Without this, a 503 from the later attempt branch masks the
  // missing proof as a transient build error.
  if (project.generationEngine === "contract-v1") {
    if (!contractHandoffId || !contractReviewHash) {
      return Response.json(
        {
          code: "project_handoff_required",
          message: "Lengkapi diskusi dan tinjau brief sebelum mulai build.",
        },
        { status: 409 },
      );
    }
    if (!/^[0-9a-f]{64}$/.test(contractReviewHash)) {
      return Response.json(
        {
          code: "project_handoff_required",
          message: "Lengkapi diskusi dan tinjau brief sebelum mulai build.",
        },
        { status: 409 },
      );
    }
  }

  const projectId = project.id;
  const projectPrompt = project.prompt;

  const persistedSourceFiles = await loadPersistedProjectSourceFiles({
    projectId,
    userId,
  });
  const generateMode = resolveGenerateMode({
    requestedMode,
    hasPersistedSource: persistedSourceFiles.length > 0,
    generationEngine: project.generationEngine,
    hasAcceptedHandoff: Boolean(await loadActiveHandoff(projectId)),
  });
  devLog("generate", "mode.resolved", {
    projectId,
    requestedMode,
    generateMode,
    sourceFileCount: persistedSourceFiles.length,
  });

  const operation = await claimProjectOperation({
    kind: "build",
    projectId,
    userId,
  });

  if (!operation.claimed) {
    return Response.json(
      {
        code: "project_build_in_progress",
        message: "Build masih berjalan untuk proyek ini.",
      },
      { status: 409 },
    );
  }

  const operationAttemptId = `build_${randomUUID().replace(/-/g, "")}`;

  let earlyBuildId: string | null = null;
  try {
    const isContractPath = project.generationEngine === "contract-v1";

    if (isContractPath) {
      let acceptance: { created: boolean } | null = null;
      try {
        acceptance = await acceptHandoffAndCreateAttempt({
          projectId,
          userId,
          handoffId: contractHandoffId!,
          reviewHash: contractReviewHash!,
          generationEngine: project.generationEngine,
          clientIdempotencyKey:
            clientIdempotencyKey || `build_${randomUUID().replace(/-/g, "")}`,
          attemptId: operationAttemptId,
        });
      } catch (acceptError) {
        const message = acceptError instanceof Error ? acceptError.message : "";
        if (
          message.includes("review hash mismatch") ||
          message.includes("handoff not found")
        ) {
          await finalizeProjectOperation({
            data: { buildStatus: "failed", status: "failed" },
            projectId,
            token: operation.token,
            userId,
          }).catch(() => false);
          return Response.json(
            {
              code: "project_handoff_required",
              message: "Lengkapi diskusi dan tinjau brief sebelum mulai build.",
            },
            { status: 409 },
          );
        }
        throw acceptError;
      }
      if (acceptance && !acceptance.created) {
        return Response.json(
          { message: "Build ini sudah diproses." },
          { status: 200 },
        );
      }
    } else {
      await prisma.projectEditAttempt.create({
        data: {
          id: operationAttemptId,
          instruction: "Generate project from the accepted brief.",
          kind: "generate",
          leaseToken: operation.token,
          projectId,
          startedAt: new Date(),
          status: "generating",
          userId,
        },
        select: { id: true },
      });
    }

    // Placeholder snapshot so a ProjectBuild row exists before agent work.
    // Without it, agent-phase failures leave project=failed and canRetry=false.
    const earlySnapshot = await prisma.projectSnapshot.create({
      data: {
        files: [],
        metadata: {
          origin: {
            generator: "generate-placeholder",
            sourceType: "generated",
          },
        },
        projectId,
        sourceType: "generated" satisfies ProjectSnapshotSourceType,
      },
      select: { id: true },
    });
    const earlyBuild = await prisma.projectBuild.create({
      data: {
        projectId,
        snapshotId: earlySnapshot.id,
        status: "queued" satisfies ProjectBuildStatus,
      },
      select: { id: true },
    });
    earlyBuildId = earlyBuild.id;
    await prisma.projectEditAttempt.update({
      where: { id: operationAttemptId },
      data: { buildId: earlyBuild.id, snapshotId: earlySnapshot.id },
    });
  } catch {
    await finalizeProjectOperation({
      data: { buildStatus: "failed", status: "failed" },
      projectId,
      token: operation.token,
      userId,
    }).catch(() => false);

    return Response.json(
      {
        code: "build_attempt_unavailable",
        message: "Build belum bisa dimulai. Coba lagi sebentar.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }

  try {
    await enqueueAttemptJob({
      kind: "generate",
      attemptId: operationAttemptId,
      buildId: earlyBuildId,
      generateMode,
      operationToken: operation.token,
      projectId,
      projectPrompt,
      projectStatus: project.status,
      userId,
    });
  } catch (error) {
    await finalizeProjectOperation({
      data: { buildStatus: "failed", status: "failed" },
      projectId,
      token: operation.token,
      userId,
    }).catch(() => false);
    publishBuildProgress(operationAttemptId, {
      type: "error",
      detail: mapToUserFacingError(
        error instanceof Error ? error.message : String(error),
      ),
      message: "Build belum bisa dimulai. Coba lagi sebentar.",
    });
    return Response.json(
      {
        code: "build_attempt_unavailable",
        message: "Build belum bisa dimulai. Coba lagi sebentar.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }

  return createReadStreamFromChannel(operationAttemptId);
}
