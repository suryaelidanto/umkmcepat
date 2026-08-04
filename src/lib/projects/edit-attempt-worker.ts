import { recordAiCall } from "@/lib/ai-call-record";
import { getGenerationModel } from "@/lib/ai-models";
import { getSettingSync } from "@/lib/app-settings";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { enqueueAndWaitEditBuild } from "@/lib/projects/attempt-queue";
import { runBatchedEdit } from "@/lib/projects/batched-edit";
import { isBatchedFilePersistable } from "@/lib/projects/batched-generator";
import {
  type BatchedRolloutValue,
  isBatchedRolloutValue,
  isBatchedWriterRolledOut,
} from "@/lib/projects/batched-rollout";
import { publishBuildProgress } from "@/lib/projects/build-attempt-pubsub";
import { selectActivePreviewDeployment } from "@/lib/projects/deployment-resolution";
import { type DiffLine } from "@/lib/projects/diff";
import { validateGeneratedEdit } from "@/lib/projects/edit-validation";
import { createStepCharger } from "@/lib/projects/energy-step-charger";
import { formatGeneratedSource } from "@/lib/projects/format-generated-source";
import {
  createGeneratedSourceSnapshotMetadata,
  parseGeneratedProjectFiles,
} from "@/lib/projects/generated-source";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import { createProgressiveSaver } from "@/lib/projects/progressive-save";
import {
  finalizeProjectOperation,
  renewProjectOperation,
} from "@/lib/projects/project-operation";
import { refreshProjectThumbnail } from "@/lib/projects/project-thumbnail";
import {
  readProjectSourceArtifact,
  resolveArtifactFilesDir,
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
import { isAdminEmail } from "@/lib/waitlist";

async function updateProjectEditAttempt(
  id: string,
  input: {
    advisoryIssues?: unknown;
    buildId?: string;
    errorMessage?: string | null;
    finishedAt?: Date;
    snapshotId?: string;
    status?: string;
    validationIssues?: unknown;
  },
) {
  await prisma.projectEditAttempt.update({
    where: { id },
    data: {
      advisoryIssues: input.advisoryIssues as never,
      buildId: input.buildId,
      errorMessage: input.errorMessage ?? undefined,
      finishedAt: input.finishedAt,
      snapshotId: input.snapshotId,
      status: input.status,
      validationIssues: input.validationIssues as never,
    },
  });
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

export async function runEditAttempt({
  abortSignal,
  attemptId,
  operationToken,
  projectId,
  userId,
}: {
  abortSignal: AbortSignal;
  attemptId: string;
  operationToken: string;
  projectId: string;
  userId: string;
}): Promise<void> {
  const attempt = await prisma.projectEditAttempt.findFirst({
    where: { id: attemptId, projectId, userId },
    select: {
      id: true,
      instruction: true,
      parentSnapshotId: true,
      status: true,
    },
  });
  if (!attempt) {
    publishBuildProgress(attemptId, {
      type: "error",
      detail: "Edit attempt tidak ditemukan.",
    });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true,
      status: true,
      buildStatus: true,
      siteSchema: true,
      prompt: true,
    },
  });
  if (!project) {
    publishBuildProgress(attemptId, {
      type: "error",
      detail: "Proyek tidak ditemukan.",
    });
    return;
  }

  const instruction = attempt.instruction;
  const operation = { token: operationToken };

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
        select: { files: true, id: true, sourceRef: true },
      },
      snapshotId: true,
      status: true,
      updatedAt: true,
    },
  });
  const activeDeployment = selectActivePreviewDeployment(deployments);
  const activeSnapshot = activeDeployment?.snapshot;
  if (!activeSnapshot) {
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Belum ada preview berhasil untuk diedit.",
      finishedAt: new Date(),
      status: "failed",
    });
    await restoreProjectReadyState(project.id, userId, operation.token);
    publishBuildProgress(attemptId, {
      type: "error",
      detail: "Belum ada preview berhasil untuk diedit.",
    });
    return;
  }

  const artifactFiles = activeSnapshot.sourceRef
    ? await readProjectSourceArtifact(activeSnapshot.sourceRef).catch(() => [])
    : [];
  const baseFiles = artifactFiles.length
    ? artifactFiles
    : parseGeneratedProjectFiles(activeSnapshot.files);

  if (!baseFiles.length) {
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Source preview belum tersedia untuk diedit.",
      finishedAt: new Date(),
      status: "failed",
    });
    await restoreProjectReadyState(project.id, userId, operation.token);
    publishBuildProgress(attemptId, {
      type: "error",
      detail: "Source preview belum tersedia untuk diedit.",
    });
    return;
  }

  let activeBuildId: string | null = null;
  let lastProgressLabel: string | null = null;
  let sendProgress: (label: string, detail?: string) => void = () => {};

  // Durable per-tool-call progress so refresh can rehydrate the edit
  // observer UI with real step-by-step detail, not just one static label.
  function persistEditProgress(operation: {
    detail: string;
    diff?: DiffLine[];
    path?: string;
    title: string;
  }) {
    const label = operation.title;
    const detail = operation.path
      ? `${operation.detail} (${operation.path})`
      : operation.detail;
    sendProgress(label, detail);

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
              diff: operation.diff,
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

  const editStepCharger = createStepCharger({
    userId,
    projectId: project.id,
    reason: "edit:step",
    modelId: getGenerationModel(),
    recordMeta: { attemptId },
  });

  const send = (event: string, data: Record<string, unknown>) => {
    publishBuildProgress(attemptId, { ...data, type: event } as never);
  };
  sendProgress = (label, detail) => {
    send("progress", { label, detail });
  };

  try {
    persistEditProgress({
      detail: "AI menerapkan revisi ke source website.",
      title: "Merevisi website",
    });

    const saver = createProgressiveSaver({
      projectId: project.id,
      token: operation.token,
      userId: userId,
      logContext: "edit",
    });

    const onFilesChanged = (currentFiles: GeneratedProjectFile[]) => {
      saver.save(currentFiles);
    };

    // Batched rollout (same flag as generate): batched writer tries the edit
    // as ONE response, falling back to the legacy ToolLoopAgent on
    // needsFallback/throw — never surfaces breakage.
    let useBatchedEdit = false;
    try {
      const rolloutRaw: string = getSettingSync(
        "generation.batched_rollout",
        "off",
      );
      const rollout: BatchedRolloutValue = isBatchedRolloutValue(rolloutRaw)
        ? rolloutRaw
        : "off";
      let batchedIsAdmin = false;
      if (rollout === "internal") {
        const owner = await prisma.user
          .findUnique({ where: { id: userId }, select: { email: true } })
          .catch(() => null);
        batchedIsAdmin = owner?.email ? isAdminEmail(owner.email) : false;
      }
      useBatchedEdit = isBatchedWriterRolledOut({
        isAdmin: batchedIsAdmin,
        projectId: project.id,
        rollout,
      });
    } catch {
      useBatchedEdit = false;
    }

    // Durable write-through while the batched writer streams: overlay the
    // batched-staged paths onto the LIVE base so interrupted edits still land.
    // Semantic gate mirrors the merge-time filter (protected / TSX-broken
    // blocks never persist mid-stream; targeted repair re-emits them later).
    const batchedStageFiles = new Map<string, GeneratedProjectFile>();
    const persistBatchedStage = (file: GeneratedProjectFile) => {
      if (!isBatchedFilePersistable(file)) {
        return;
      }
      batchedStageFiles.set(file.path, file);
      const merged = new Map<string, GeneratedProjectFile>();
      for (const base of baseFiles) {
        merged.set(base.path, base);
      }
      for (const [path, overlay] of batchedStageFiles) {
        merged.set(path, overlay);
      }
      onFilesChanged([...merged.values()]);
    };

    let editResult:
      Awaited<ReturnType<typeof editGeneratedSourceWithAgent>> | undefined;

    if (useBatchedEdit) {
      try {
        const batched = await runBatchedEdit({
          abortSignal,
          attemptId: attempt.id,
          instruction,
          onEvent(type, data) {
            send(type, data);
          },
          onFileStaged: persistBatchedStage,
          projectId: project.id,
          sourceFiles: baseFiles,
          stepCharger: editStepCharger,
        });
        if (batched.ok) {
          editResult = {
            check: null,
            files: batched.files,
            modelId: getGenerationModel(),
            ok: true,
            operations: batched.writtenPaths.map((path) => ({
              detail: "File ditulis writer batched.",
              id: path,
              path,
              state: "succeeded",
              title: "Menulis file",
              type: "write_file",
            })),
            outputs: [],
            sideEffects: batched.writtenPaths.map((path) => ({
              path,
              type: "write_file",
            })),
            usage: { inputTokens: 0, outputTokens: 0 },
          };
        } else {
          devLog("edit", "batched.fallback", {
            projectId: project.id,
            reason: batched.reason,
            repairRounds: batched.repairRounds,
          });
          recordAiCall({
            attemptId: attempt.id,
            modelRequested: getGenerationModel(),
            phase: "fallback",
            projectId: project.id,
            status: "ok",
            task: "edit",
          });
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        devLog("edit", "batched.error-fallback", {
          error: error instanceof Error ? error.message : String(error),
          projectId: project.id,
        });
        recordAiCall({
          attemptId: attempt.id,
          modelRequested: getGenerationModel(),
          phase: "fallback",
          projectId: project.id,
          status: "ok",
          task: "edit",
        });
      }
    }

    if (!editResult) {
      editResult = await editGeneratedSourceWithAgent({
        files: baseFiles,
        instruction,
        onOperation: persistEditProgress,
        onFilesChanged,
        stepCharger: editStepCharger,
        abortSignal: abortSignal,
      });
    }
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
        model: getGenerationModel(),
        onOperation: persistEditProgress,
        onFilesChanged,
        stepCharger: editStepCharger,
        abortSignal: abortSignal,
      });

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

    await saver.flush();

    const editLeaseRenewed = await renewProjectOperation({
      projectId: project.id,
      token: operation.token,
      userId: userId,
    });

    if (!editLeaseRenewed) {
      throw new Error("Edit operation lease was superseded.");
    }

    if (!editResult.ok) {
      await updateProjectEditAttempt(attempt.id, {
        errorMessage:
          "Edit belum bisa diterapkan. Cek instruksi dan coba lagi.",
        finishedAt: new Date(),
        status: "failed",
        validationIssues: editResult.outputs,
      });
      await restoreProjectReadyState(project.id, userId, operation.token);

      send("error", {
        attemptId: attempt.id,
        message: "Edit belum bisa diterapkan. Cek instruksi dan coba lagi.",
        outputs: editResult.outputs,
      });
      return;
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
        model: getGenerationModel(),
        instruction: [
          instruction,
          "Previous edit did not make a meaningful rendered-source change.",
          "Repair it now. Make concrete edits to rendered JSX/content/CSS. Run check_app.",
          `Validation issues: ${editValidation.blockingIssues.join("; ")}`,
        ].join("\n\n"),
        onOperation: persistEditProgress,
        onFilesChanged,
        stepCharger: editStepCharger,
        abortSignal: abortSignal,
      });

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

    await saver.flush();

    const validationLeaseRenewed = await renewProjectOperation({
      projectId: project.id,
      token: operation.token,
      userId: userId,
    });

    if (!validationLeaseRenewed) {
      throw new Error("Edit operation lease was superseded.");
    }

    if (!editValidation.ok) {
      devLog("edit", "validation.failed", {
        issues: editValidation.blockingIssues,
        projectId: project.id,
      });
      const validationUserMessage =
        "AI belum berhasil mengubah bagian website yang terlihat. Komentarmu tetap tersimpan, coba kirim ulang.";
      await updateProjectEditAttempt(attempt.id, {
        errorMessage: validationUserMessage,
        finishedAt: new Date(),
        status: "failed",
        validationIssues: editValidation.blockingIssues,
      });
      await restoreProjectReadyState(project.id, userId, operation.token);

      send("error", {
        attemptId: attempt.id,
        code: "edit_validation_failed",
        issues: editValidation.blockingIssues,
        message: validationUserMessage,
      });
      return;
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
    await prisma.runtimeEvent.create({
      data: createRuntimeEventData({
        buildId: build.id,
        message: "Edited source build queued.",
        projectId: project.id,
        type: "build.started",
      }),
    });

    const queuedBuild = await enqueueAndWaitEditBuild({
      kind: "edit-build",
      attemptId: attempt.id,
      buildId: build.id,
      operationToken: operation.token,
      projectId: project.id,
      snapshotId: snapshot.id,
      sourceRef,
      userId,
    });
    const { readProjectDistArtifact } =
      await import("@/lib/projects/runtime-artifacts");
    const distFiles =
      queuedBuild.artifactRef && queuedBuild.buildStatus === "succeeded"
        ? await readProjectDistArtifact(queuedBuild.artifactRef)
        : [];
    const buildResult = {
      artifactRef: queuedBuild.artifactRef,
      distFiles,
      logText: queuedBuild.logText,
      status: queuedBuild.buildStatus,
    };
    devLog("edit", "build.finished", {
      projectId: project.id,
      status: buildResult.status,
    });
    const buildStatus: ProjectBuildStatus = buildResult.status;
    const artifactRef = buildResult.artifactRef;

    const deploymentStatus: ProjectDeploymentStatus =
      buildResult.status === "succeeded" ? "created" : "failed";
    const deployment = await prisma.$transaction(
      async (transaction) => {
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
      },
      { timeout: 30_000 },
    );

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
      const sourceDir = sourceRef ? resolveArtifactFilesDir(sourceRef) : null;
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
        // Best-effort prettier sweep over the edited source so the code tab
        // shows polished code. Fire-and-forget; never fails the turn.
        ...(sourceDir ? [formatGeneratedSource(sourceDir)] : []),
      ]);
    }

    send("done", {
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

    const failUserMessage =
      "Edit belum selesai karena layanan sedang bermasalah. Tampilan terakhir tetap aman, coba lagi sebentar.";
    await Promise.allSettled([
      updateProjectEditAttempt(attempt.id, {
        errorMessage: failUserMessage,
        finishedAt: new Date(),
        status: "failed",
      }),
      restoreProjectReadyState(project.id, userId, operation.token),
      activeBuildId
        ? prisma.projectBuild.updateMany({
            where: {
              id: activeBuildId,
              status: { in: ["queued", "running"] },
            },
            data: {
              finishedAt: new Date(),
              // English log for operators/debug; not shown as primary UI copy.
              logText: "Edit failed before completion.",
              status: "failed" satisfies ProjectBuildStatus,
            },
          })
        : Promise.resolve(),
    ]);

    send("error", {
      attemptId: attempt.id,
      code: "edit_failed_retryable",
      message: failUserMessage,
    });
  }
}
