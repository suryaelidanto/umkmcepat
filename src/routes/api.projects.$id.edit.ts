import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { createFileRoute } from "@tanstack/react-router";

import { getDefaultAiModel } from "@/lib/ai-models";
import { auth } from "@/lib/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import { isGeneratedBuildExecutionEnabled } from "@/lib/config";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { createLocalBuildWorker } from "@/lib/projects/build-worker";
import { parseProjectChatMessages } from "@/lib/projects/chat-memory";
import { selectActivePreviewDeployment } from "@/lib/projects/deployment-resolution";
import { validateGeneratedEdit } from "@/lib/projects/edit-validation";
import {
  createGeneratedSourceSnapshotMetadata,
  parseGeneratedProjectFiles,
} from "@/lib/projects/generated-source";
import {
  claimProjectOperation,
  finalizeProjectOperation,
  renewProjectOperation,
} from "@/lib/projects/project-operation";
import { refreshProjectThumbnail } from "@/lib/projects/project-thumbnail";
import {
  readProjectSourceArtifact,
  writeProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";
import { createRuntimeEventData } from "@/lib/projects/runtime-events";
import { stopSupersededPreviewDeployments } from "@/lib/projects/runtime-supervisor";
import {
  type ProjectBuildStatus,
  type ProjectDeploymentStatus,
} from "@/lib/projects/runtime-types";
import { parseProjectSiteSchema } from "@/lib/projects/site-schema";
import { editGeneratedSourceWithAgent } from "@/lib/projects/source-edit-agent";
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";
import { sanitizeVisualAnnotations } from "@/lib/projects/visual-annotations";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  addEnergyUsage,
  checkEnergy,
  isUserVerified,
  MIN_ENERGY_EDIT,
} from "@/lib/user-credits";

type EditRequest = {
  annotations?: unknown;
  instruction?: string;
  kind?: string;
  summary?: string;
};

export const Route = createFileRoute("/api/projects/$id/edit")({
  server: {
    handlers: {
      POST: ({ request, params }) => handleEditPost(request, params.id),
    },
  },
});

async function handleEditPost(request: Request, routeId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  const userId = session.user.id;
  const rateLimitResponse = await checkRateLimit(request, "build", userId);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const verified = await isUserVerified(userId);
  if (!verified) {
    return Response.json(
      {
        message: "Verifikasi nomor telepon diperlukan.",
        code: "verification_required",
      },
      { status: 403 },
    );
  }

  const energy = await checkEnergy(userId, MIN_ENERGY_EDIT);
  if (!energy.allowed) {
    return Response.json(
      {
        message: "Energi harian habis. Coba lagi besok.",
        code: "energy_exhausted",
        remaining: energy.remaining,
      },
      { status: 429 },
    );
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

  let body: EditRequest;

  try {
    body = (await readBoundedJson(request, {
      maxBytes: 256 * 1024,
    })) as EditRequest;
  } catch (error) {
    if (isBoundedJsonError(error)) {
      return Response.json(
        {
          code: error.code,
          message:
            error.code === "request_body_too_large"
              ? "Instruksi edit terlalu besar. Ringkas komentarmu, ya."
              : "Format instruksi edit belum valid.",
        },
        { status: error.code === "request_body_too_large" ? 413 : 400 },
      );
    }

    throw error;
  }

  const id = routeId;
  devLog("edit", "request", { projectId: id, userId: session.user.id });
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: {
      buildStatus: true,
      chatMessages: true,
      id: true,
      prompt: true,
      siteSchema: true,
      status: true,
    },
  });

  devLog("edit", "project.loaded", {
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

  const instruction =
    typeof body.instruction === "string" ? body.instruction.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const annotations = sanitizeVisualAnnotations(body.annotations);
  const kind =
    body.kind === "visual_comment" ? "visual_comment" : "instruction";

  if (!instruction) {
    return Response.json(
      {
        code: "edit_instruction_required",
        message: "Instruksi edit belum valid.",
      },
      { status: 400 },
    );
  }

  if (instruction.length > 16_000 || summary.length > 8_000) {
    return Response.json(
      {
        code: "edit_instruction_too_large",
        message: "Instruksi edit terlalu panjang. Ringkas komentarmu, ya.",
      },
      { status: 413 },
    );
  }

  const deployments = await prisma.projectDeployment.findMany({
    where: { kind: "preview", projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      build: {
        select: {
          artifactRef: true,
          createdAt: true,
          id: true,
          snapshotId: true,
          status: true,
          updatedAt: true,
        },
      },
      buildId: true,
      createdAt: true,
      id: true,
      kind: true,
      snapshot: {
        select: {
          files: true,
          id: true,
          sourceRef: true,
        },
      },
      snapshotId: true,
      status: true,
      updatedAt: true,
    },
  });
  const activeDeployment = selectActivePreviewDeployment(deployments);
  const activeSnapshot = activeDeployment?.snapshot;

  if (!activeSnapshot) {
    return Response.json(
      { message: "Belum ada preview berhasil untuk diedit." },
      { status: 409 },
    );
  }

  const artifactFiles = activeSnapshot.sourceRef
    ? await readProjectSourceArtifact(activeSnapshot.sourceRef).catch(() => [])
    : [];
  const baseFiles = artifactFiles.length
    ? artifactFiles
    : parseGeneratedProjectFiles(activeSnapshot.files);

  if (!baseFiles.length) {
    return Response.json(
      { message: "Source preview belum tersedia untuk diedit." },
      { status: 409 },
    );
  }

  const attempt = await createProjectEditAttempt({
    annotations: annotations.length ? annotations : undefined,
    instruction,
    kind,
    parentSnapshotId: activeSnapshot.id,
    projectId: project.id,
    status: "editing",
    summary: summary || undefined,
    userId: session.user.id,
  });

  let latestProjectState: {
    buildStatus: string;
    status: string;
  } | null;

  try {
    if (summary) {
      await persistVisualSummaryMessage({
        attemptId: attempt.id,
        messages: project.chatMessages,
        projectId: project.id,
        summary,
      });
    }

    await markStaleProjectBuilds(project.id);

    latestProjectState = await prisma.project.findFirst({
      where: { id: project.id, userId: session.user.id },
      select: { buildStatus: true, status: true },
    });
  } catch {
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Edit setup failed before the operation claim.",
      finishedAt: new Date(),
      status: "failed",
    }).catch(() => undefined);

    return Response.json(
      {
        attemptId: attempt.id,
        code: "edit_failed_retryable",
        message:
          "Edit belum bisa dimulai. Tampilan terakhir tetap aman, coba lagi sebentar.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }

  if (
    latestProjectState?.status === "building" ||
    latestProjectState?.buildStatus === "running"
  ) {
    await updateProjectEditAttempt(attempt.id, {
      status: "failed",
      errorMessage: "Another build is already running.",
      finishedAt: new Date(),
    });

    return Response.json(
      {
        attemptId: attempt.id,
        code: "project_build_in_progress",
        message: "Build masih berjalan untuk proyek ini.",
      },
      { status: 409 },
    );
  }

  let operation: Awaited<ReturnType<typeof claimProjectOperation>>;

  try {
    operation = await claimProjectOperation({
      kind: "edit",
      projectId: project.id,
      userId: session.user.id,
    });
  } catch {
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Edit claim failed.",
      finishedAt: new Date(),
      status: "failed",
    }).catch(() => undefined);

    return Response.json(
      {
        attemptId: attempt.id,
        code: "edit_failed_retryable",
        message:
          "Edit belum bisa dimulai. Tampilan terakhir tetap aman, coba lagi sebentar.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }

  if (!operation.claimed) {
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Another build is already running.",
      finishedAt: new Date(),
      status: "failed",
    });

    return Response.json(
      {
        attemptId: attempt.id,
        code: "project_build_in_progress",
        message: "Build masih berjalan untuk proyek ini.",
      },
      { status: 409 },
    );
  }

  try {
    await updateProjectEditAttempt(attempt.id, {
      leaseToken: operation.token,
      startedAt: new Date(),
    });
  } catch {
    await finalizeProjectOperation({
      data: { buildStatus: "passed", status: "ready" },
      projectId: project.id,
      token: operation.token,
      userId: session.user.id,
    }).catch(() => false);

    return Response.json(
      {
        attemptId: attempt.id,
        code: "edit_failed_retryable",
        message:
          "Edit belum bisa dimulai. Tampilan terakhir tetap aman, coba lagi sebentar.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }
  let activeBuildId: string | null = null;
  let lastProgressLabel: string | null = null;

  // Durable per-tool-call progress so refresh can rehydrate the edit
  // observer UI with real step-by-step detail, not just one static label.
  function persistEditProgress(operation: {
    detail: string;
    path?: string;
    title: string;
  }) {
    const label = operation.title;
    if (label === lastProgressLabel) {
      return;
    }
    lastProgressLabel = label;
    try {
      void prisma.runtimeEvent
        .create({
          data: createRuntimeEventData({
            buildId: activeBuildId,
            message: label,
            metadata: {
              detail: operation.path
                ? `${operation.detail} (${operation.path})`
                : operation.detail,
              label,
            },
            projectId: project!.id,
            type: "build.progress",
          }),
        })
        ?.catch(() => undefined);
    } catch {
      // Non-fatal: edit continues even if progress event write fails.
    }
  }

  try {
    let totalEditInputTokens = 0;
    let totalEditOutputTokens = 0;

    persistEditProgress({
      detail: "AI menerapkan revisi ke source website.",
      title: "Merevisi website",
    });

    const editResult = await editGeneratedSourceWithAgent({
      files: baseFiles,
      instruction,
      onOperation: persistEditProgress,
    });
    totalEditInputTokens += editResult.usage?.inputTokens ?? 0;
    totalEditOutputTokens += editResult.usage?.outputTokens ?? 0;
    devLog("edit", "tools.finished", {
      ok: editResult.ok,
      operations: editResult.operations.length,
      projectId: project.id,
      sideEffects: editResult.sideEffects.length,
    });

    if (!editResult.ok) {
      await updateProjectEditAttempt(attempt.id, { status: "repairing" });
      const fallbackResult = await editGeneratedSourceWithAgent({
        files: baseFiles,
        instruction: [
          instruction,
          "The fast edit attempt failed. Retry carefully with the stronger default model.",
          "Keep the edit minimal and run check_app.",
        ].join("\n\n"),
        model: getDefaultAiModel(),
        onOperation: persistEditProgress,
      });
      totalEditInputTokens += fallbackResult.usage?.inputTokens ?? 0;
      totalEditOutputTokens += fallbackResult.usage?.outputTokens ?? 0;

      if (fallbackResult.ok) {
        editResult.files = fallbackResult.files;
        editResult.operations = [
          ...editResult.operations,
          ...fallbackResult.operations,
        ];
        editResult.outputs = [...editResult.outputs, ...fallbackResult.outputs];
        editResult.sideEffects = fallbackResult.sideEffects;
      }
    }

    const editLeaseRenewed = await renewProjectOperation({
      projectId: project.id,
      token: operation.token,
      userId: session.user.id,
    });

    if (!editLeaseRenewed) {
      throw new Error("Edit operation lease was superseded.");
    }

    if (!editResult.ok) {
      await updateProjectEditAttempt(attempt.id, {
        errorMessage: "Edit agent failed.",
        finishedAt: new Date(),
        status: "failed",
        validationIssues: editResult.outputs,
      });
      await restoreProjectReadyState(
        project.id,
        session.user.id,
        operation.token,
      );

      return Response.json(
        {
          attemptId: attempt.id,
          message: "Edit belum bisa diterapkan. Cek instruksi dan coba lagi.",
          outputs: editResult.outputs,
        },
        { status: 400 },
      );
    }

    const touchedFiles = editResult.sideEffects
      .map((effect) => effect.path)
      .filter((path): path is string => Boolean(path));
    let editValidation = validateGeneratedEdit({
      baseFiles,
      instruction,
      nextFiles: editResult.files,
      touchedFiles,
    });

    if (!editValidation.ok) {
      await updateProjectEditAttempt(attempt.id, {
        status: "repairing",
        validationIssues: editValidation.blockingIssues,
      });

      const repairResult = await editGeneratedSourceWithAgent({
        files: editResult.files,
        model: getDefaultAiModel(),
        instruction: [
          instruction,
          "Previous edit did not make a meaningful rendered-source change.",
          "Repair it now. Make concrete edits to rendered JSX/content/CSS. Run check_app.",
          `Validation issues: ${editValidation.blockingIssues.join("; ")}`,
        ].join("\n\n"),
        onOperation: persistEditProgress,
      });
      totalEditInputTokens += repairResult.usage?.inputTokens ?? 0;
      totalEditOutputTokens += repairResult.usage?.outputTokens ?? 0;

      if (repairResult.ok) {
        editResult.files = repairResult.files;
        editResult.operations = [
          ...editResult.operations,
          ...repairResult.operations,
        ];
        editResult.outputs = [...editResult.outputs, ...repairResult.outputs];
        editResult.sideEffects = [
          ...editResult.sideEffects,
          ...repairResult.sideEffects,
        ];
        touchedFiles.push(
          ...repairResult.sideEffects
            .map((effect) => effect.path)
            .filter((path): path is string => Boolean(path)),
        );
        editValidation = validateGeneratedEdit({
          baseFiles,
          instruction,
          nextFiles: editResult.files,
          touchedFiles,
        });
      }
    }

    const validationLeaseRenewed = await renewProjectOperation({
      projectId: project.id,
      token: operation.token,
      userId: session.user.id,
    });

    if (!validationLeaseRenewed) {
      throw new Error("Edit operation lease was superseded.");
    }

    if (!editValidation.ok) {
      devLog("edit", "validation.failed", {
        issues: editValidation.blockingIssues,
        projectId: project.id,
      });
      await updateProjectEditAttempt(attempt.id, {
        errorMessage: "Edit did not change rendered source.",
        finishedAt: new Date(),
        status: "failed",
        validationIssues: editValidation.blockingIssues,
      });
      await restoreProjectReadyState(
        project.id,
        session.user.id,
        operation.token,
      );

      return Response.json(
        {
          attemptId: attempt.id,
          code: "edit_validation_failed",
          issues: editValidation.blockingIssues,
          message:
            "AI belum berhasil mengubah bagian website yang terlihat. Komentarmu tetap tersimpan, coba kirim ulang.",
        },
        { status: 422 },
      );
    }

    await updateProjectEditAttempt(attempt.id, {
      advisoryIssues: editValidation.advisoryIssues,
      status: "building",
    });

    const siteSchema = parseProjectSiteSchema(
      project.siteSchema,
      project.prompt,
    );
    const snapshot = await prisma.projectSnapshot.create({
      data: {
        files: editResult.files,
        metadata: {
          ...createGeneratedSourceSnapshotMetadata(
            editResult.files,
            siteSchema,
          ),
          origin: {
            generator: "agent-tool-runner",
            parentSnapshotId: activeSnapshot.id,
            sourceType: "edited",
          },
          generation: {
            mode: "agent-edit",
            operationTrace: editResult.operations,
            editValidation,
            touchedFiles,
          },
          sideEffects: editResult.sideEffects,
        },
        parentSnapshotId: activeSnapshot.id,
        projectId: project.id,
        sourceType: "edited",
      },
      select: { id: true },
    });
    const sourceRef = await writeProjectSourceArtifact({
      artifactId: snapshot.id,
      files: editResult.files,
    });
    await prisma.projectSnapshot.update({
      where: { id: snapshot.id },
      data: { sourceRef },
    });
    await prisma.runtimeEvent.create({
      data: createRuntimeEventData({
        metadata: { parentSnapshotId: activeSnapshot.id, sourceRef },
        projectId: project.id,
        type: "snapshot.created",
      }),
    });

    const build = await prisma.projectBuild.create({
      data: {
        projectId: project.id,
        snapshotId: snapshot.id,
        status: "queued" satisfies ProjectBuildStatus,
      },
      select: { id: true },
    });
    activeBuildId = build.id;
    await updateProjectEditAttempt(attempt.id, {
      buildId: build.id,
      snapshotId: snapshot.id,
    });
    await prisma.projectBuild.update({
      where: { id: build.id },
      data: {
        startedAt: new Date(),
        status: "running" satisfies ProjectBuildStatus,
      },
    });
    await prisma.runtimeEvent.create({
      data: createRuntimeEventData({
        buildId: build.id,
        message: "Edited source build started.",
        projectId: project.id,
        type: "build.started",
      }),
    });

    const buildResult = await createLocalBuildWorker().runBuild({
      buildId: build.id,
      files: editResult.files,
    });
    devLog("edit", "build.finished", {
      projectId: project.id,
      status: buildResult.status,
    });
    const buildStatus: ProjectBuildStatus = buildResult.status;
    const artifactRef = buildResult.artifactRef;

    const deploymentStatus: ProjectDeploymentStatus =
      buildResult.status === "succeeded" ? "created" : "failed";
    const deployment = await prisma.$transaction(async (transaction) => {
      const finalized = await finalizeProjectOperation({
        data:
          buildResult.status === "succeeded"
            ? {
                buildLog: buildResult.logText,
                buildStatus: "passed",
                builtAt: new Date(),
                distFiles: buildResult.distFiles,
                sourceFiles: editResult.files,
                status: "ready",
              }
            : {
                buildLog: buildResult.logText,
                buildStatus: "failed",
                status: "ready",
              },
        projectId: project.id,
        store: transaction,
        token: operation.token,
        userId,
      });

      if (!finalized) {
        throw new Error("Edit operation lease was superseded.");
      }

      await transaction.projectBuild.update({
        where: { id: build.id },
        data: {
          artifactRef,
          finishedAt: new Date(),
          logText: buildResult.logText,
          status: buildStatus,
        },
      });
      const committedDeployment = await transaction.projectDeployment.create({
        data: {
          buildId: build.id,
          kind: "preview",
          projectId: project.id,
          publicPath: `/api/projects/${project.id}/preview`,
          snapshotId: snapshot.id,
          status: deploymentStatus,
        },
        select: { id: true },
      });
      await transaction.projectEditAttempt.update({
        where: { id: attempt.id },
        data: {
          advisoryIssues: editValidation.advisoryIssues,
          errorMessage:
            buildResult.status === "succeeded"
              ? null
              : buildResult.logText?.slice(-2000),
          finishedAt: new Date(),
          status: buildResult.status === "succeeded" ? "succeeded" : "failed",
        },
      });

      return committedDeployment;
    });

    await Promise.allSettled([
      prisma.runtimeEvent.create({
        data: createRuntimeEventData({
          buildId: build.id,
          message:
            buildResult.status === "succeeded"
              ? "Edited frontend build succeeded."
              : "Edited frontend build failed.",
          metadata: artifactRef ? { artifactRef } : undefined,
          projectId: project.id,
          type:
            buildResult.status === "succeeded"
              ? "build.succeeded"
              : "build.failed",
        }),
      }),
      prisma.runtimeEvent.create({
        data: createRuntimeEventData({
          buildId: build.id,
          deploymentId: deployment.id,
          projectId: project.id,
          type:
            buildResult.status === "succeeded"
              ? "deployment.created"
              : "deployment.failed",
        }),
      }),
    ]);

    if (artifactRef && buildResult.status === "succeeded") {
      await Promise.allSettled([
        refreshProjectThumbnail({
          artifactRef,
          buildId: build.id,
          projectId: project.id,
        }),
        stopSupersededPreviewDeployments({
          activeDeploymentId: deployment.id,
          projectId: project.id,
        }),
      ]);
    }

    if (buildResult.status === "succeeded") {
      await addEnergyUsage(
        userId,
        totalEditInputTokens,
        totalEditOutputTokens,
        "edit_turn",
      );
    }

    return Response.json({
      attemptId: attempt.id,
      buildId: build.id,
      buildStatus,
      deploymentId: deployment.id,
      snapshotId: snapshot.id,
    });
  } catch (error) {
    devLog("edit", "unexpected-failure", {
      error: error instanceof Error ? error.name : "unknown",
      projectId: project.id,
    });

    await Promise.allSettled([
      updateProjectEditAttempt(attempt.id, {
        errorMessage: "Edit failed before completion.",
        finishedAt: new Date(),
        status: "failed",
      }),
      restoreProjectReadyState(project.id, session.user.id, operation.token),
      activeBuildId
        ? prisma.projectBuild.updateMany({
            where: {
              id: activeBuildId,
              status: { in: ["queued", "running"] },
            },
            data: {
              finishedAt: new Date(),
              logText: "Edit failed before completion.",
              status: "failed" satisfies ProjectBuildStatus,
            },
          })
        : Promise.resolve(),
    ]);

    return Response.json(
      {
        attemptId: attempt.id,
        code: "edit_failed_retryable",
        message:
          "Edit belum selesai karena layanan sedang bermasalah. Tampilan terakhir tetap aman, coba lagi sebentar.",
      },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }
}

async function restoreProjectReadyState(
  projectId: string,
  userId: string,
  operationToken: string,
) {
  await finalizeProjectOperation({
    data: { buildStatus: "passed", status: "ready" },
    projectId,
    token: operationToken,
    userId,
  });
}

async function persistVisualSummaryMessage({
  attemptId,
  messages,
  projectId,
  summary,
}: {
  attemptId: string;
  messages: unknown;
  projectId: string;
  summary: string;
}) {
  const current = parseProjectChatMessages(messages);
  const exists = current.some((message) => message.id === attemptId);

  if (exists) {
    return;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      chatMessages: [
        ...current,
        {
          id: attemptId,
          parts: [{ text: summary, type: "text" }],
          role: "user",
        },
      ] as Prisma.InputJsonValue,
    },
  });
}

type EditAttemptCreateInput = {
  annotations?: unknown;
  instruction: string;
  kind: string;
  parentSnapshotId: string;
  projectId: string;
  status: string;
  summary?: string;
  userId: string;
};

type EditAttemptUpdateInput = Partial<{
  advisoryIssues: unknown;
  buildId: string;
  errorMessage: string | null;
  finishedAt: Date;
  leaseToken: string;
  snapshotId: string;
  startedAt: Date;
  status: string;
  validationIssues: unknown;
}>;

async function createProjectEditAttempt(input: EditAttemptCreateInput) {
  const id = `edit_${randomUUID().replace(/-/g, "")}`;

  await prisma.projectEditAttempt.create({
    data: {
      annotations: input.annotations
        ? (input.annotations as Prisma.InputJsonValue)
        : undefined,
      id,
      instruction: input.instruction,
      kind: input.kind,
      parentSnapshotId: input.parentSnapshotId,
      projectId: input.projectId,
      status: input.status,
      summary: input.summary,
      userId: input.userId,
    },
  });

  return { id };
}

async function updateProjectEditAttempt(
  id: string,
  input: EditAttemptUpdateInput,
) {
  await prisma.projectEditAttempt.update({
    where: { id },
    data: {
      advisoryIssues: input.advisoryIssues
        ? (input.advisoryIssues as Prisma.InputJsonValue)
        : undefined,
      buildId: input.buildId,
      errorMessage: input.errorMessage ?? undefined,
      finishedAt: input.finishedAt,
      leaseToken: input.leaseToken,
      snapshotId: input.snapshotId,
      startedAt: input.startedAt,
      status: input.status,
      validationIssues: input.validationIssues
        ? (input.validationIssues as Prisma.InputJsonValue)
        : undefined,
    },
  });
}
