import { getGenerationModel } from "@/lib/ai/ai-models";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { runAgenticGenerate } from "@/lib/projects/agentic-generator";
import { enqueueAndWaitEditBuild } from "@/lib/projects/attempt-queue";
import { parseProjectBrief } from "@/lib/projects/brief";
import { publishBuildProgress } from "@/lib/projects/build-attempt-pubsub";
import {
  isSuccessfulBuildStatus,
  persistSuccessfulBuildCheckpoint,
} from "@/lib/projects/build-checkpoint";
import {
  appendBuildSessionLog,
  type BuildSessionLogOperation,
} from "@/lib/projects/build-session-log";
import {
  createDiscussionContextSnapshot,
  parseCanonicalBrief,
} from "@/lib/projects/canonical-brief";
import { resolveProjectChatState } from "@/lib/projects/chat-memory";
import {
  isProjectDeploymentForProject,
  selectActivePreviewDeployment,
} from "@/lib/projects/deployment-resolution";
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
  isProjectArtifactRefFor,
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

function isPersistableSourceFile(file: GeneratedProjectFile): boolean {
  return (
    typeof file.path === "string" &&
    file.path.trim().length > 0 &&
    typeof file.content === "string" &&
    (file.path.startsWith("src/") || file.path.startsWith("public/"))
  );
}

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
      brief: true,
      chatMessages: true,
      chatSummary: true,
      memoryFacts: true,
      prompt: true,
      title: true,
      userId: true,
    },
  });
  if (!project) {
    publishBuildProgress(attemptId, {
      type: "error",
      detail: "Proyek tidak ditemukan.",
    });
    return;
  }

  const appendEditSessionLog = (input: {
    failed: boolean;
    skillDigestVersion?: string;
    skillsRead?: string[];
    stopped?: boolean;
    touchedFiles?: string[];
    operations?: Awaited<
      ReturnType<typeof runAgenticGenerate>
    >["operationTrace"];
  }) =>
    appendBuildSessionLog({
      attemptId,
      failed: input.failed,
      kind: "edit",
      projectId: project.id,
      skillDigestVersion: input.skillDigestVersion,
      skillsRead: input.skillsRead ?? [],
      stopped: input.stopped,
      touchedFiles: input.touchedFiles ?? [],
      operations: input.operations,
      userId,
    }).catch(() => undefined);

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
          projectId: true,
          snapshot: { select: { id: true, projectId: true } },
          snapshotId: true,
          status: true,
          updatedAt: true,
        },
      },
      buildId: true,
      createdAt: true,
      id: true,
      kind: true,
      projectId: true,
      snapshot: {
        select: { files: true, id: true, projectId: true, sourceRef: true },
      },
      snapshotId: true,
      status: true,
      updatedAt: true,
    },
  });
  const activeDeployment = selectActivePreviewDeployment(
    deployments.filter((candidate) =>
      isProjectDeploymentForProject(candidate, project.id),
    ),
  );
  const activeSnapshot = activeDeployment?.snapshot;
  if (!activeSnapshot) {
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Belum ada preview berhasil untuk diedit.",
      finishedAt: new Date(),
      status: "failed",
    });
    await appendEditSessionLog({ failed: true });
    await restoreProjectReadyState(project.id, userId, operation.token);
    publishBuildProgress(attemptId, {
      type: "error",
      detail: "Belum ada preview berhasil untuk diedit.",
    });
    return;
  }

  const activeSourceRef = activeSnapshot.sourceRef;
  const artifactFiles = isProjectArtifactRefFor(
    activeSourceRef,
    "source",
    activeSnapshot.id,
  )
    ? await readProjectSourceArtifact(activeSourceRef).catch(() => [])
    : [];
  const baseFiles = artifactFiles.length
    ? artifactFiles
    : parseGeneratedProjectFiles(activeSnapshot.files);

  if (!baseFiles.length) {
    await updateProjectEditAttempt(attempt.id, {
      errorMessage: "Tampilan website sebelumnya belum tersedia untuk diedit.",
      finishedAt: new Date(),
      status: "failed",
    });
    await appendEditSessionLog({ failed: true });
    await restoreProjectReadyState(project.id, userId, operation.token);
    publishBuildProgress(attemptId, {
      type: "error",
      detail: "Tampilan website sebelumnya belum tersedia untuk diedit.",
    });
    return;
  }

  let activeBuildId: string | null = null;
  let lastProgressLabel: string | null = null;
  let sendProgress: (label: string, detail?: string) => void = () => {};
  let sessionFailed = true;
  let sessionSkillDigestVersion: string | undefined;
  let sessionSkillsRead: string[] = [];
  let sessionTouchedFiles: string[] = [];
  let sessionOperations: BuildSessionLogOperation[] = [];

  function captureSessionOperation(data: Record<string, unknown>): void {
    const state = data.state;
    if (
      typeof data.detail !== "string" ||
      typeof data.id !== "string" ||
      typeof data.title !== "string" ||
      typeof data.type !== "string" ||
      (state !== "succeeded" && state !== "failed" && state !== "active")
    ) {
      return;
    }
    const touchedPath =
      data.type === "set_design_system"
        ? "src/index.css"
        : data.type === "set_design_direction"
          ? "DESIGN.md"
          : data.type === "write_file" || data.type === "copy_component"
            ? data.path
            : undefined;
    if (typeof touchedPath === "string" && touchedPath.trim()) {
      sessionTouchedFiles = [
        ...new Set([...sessionTouchedFiles, touchedPath.trim()]),
      ];
    }
    sessionOperations.push({
      detail: data.detail,
      id: `edit-${data.id}`,
      ...(typeof data.path === "string" ? { path: data.path } : {}),
      state,
      title: data.title,
      type: data.type,
    });
  }

  // Durable per-tool-call progress so refresh can rehydrate the edit
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
      detail: "Website sedang diperbarui.",
      title: "Memperbarui website",
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

    // Contract-v1 batched writer: the ONLY edit path. It tries the edit as ONE
    const batchedStageFiles = new Map<string, GeneratedProjectFile>();
    const persistBatchedStage = (file: GeneratedProjectFile) => {
      if (!isPersistableSourceFile(file)) {
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

    const storedBrief = parseCanonicalBrief(project.brief, project.prompt);
    const chatState = resolveProjectChatState({
      chatMessages: project.chatMessages,
      chatSummary: project.chatSummary,
      memoryFacts: project.memoryFacts,
      fallback: storedBrief.discussionContext,
    });
    const storedMessages = chatState.messages;
    const agenticResult = await runAgenticGenerate({
      abortSignal,
      attemptId: attempt.id,
      brief: {
        ...parseProjectBrief(storedBrief, project.prompt),
        prompt: instruction,
        businessName: storedBrief.business.name || project.title,
        factLedger: storedBrief.factLedger,
        discussionContext: createDiscussionContextSnapshot({
          messages: storedMessages,
          summary: chatState.summary,
          memoryFacts: chatState.memoryFacts,
        }),
      },
      initialFiles: baseFiles,
      onEvent(type: string, data: unknown) {
        if (type === "operation" && typeof data === "object" && data !== null) {
          captureSessionOperation(data as Record<string, unknown>);
        }
        send(type, data as Record<string, unknown>);
      },
      onFileStaged: persistBatchedStage,
      projectId: project.id,
      revisionBrief: `User edit instruction: ${instruction}`,
      schema: parseProjectSiteSchema(project.siteSchema),
      stepCharger: editStepCharger,
      userId: project.userId,
    });

    sessionSkillDigestVersion = agenticResult.skillDigest?.version;
    sessionSkillsRead = agenticResult.skillsRead;
    sessionTouchedFiles = agenticResult.touchedFiles;
    if (sessionOperations.length === 0) {
      sessionOperations = agenticResult.operationTrace.map((operation) => ({
        ...operation,
        id: `edit-${operation.id}`,
      }));
    }

    const editResult = {
      check: null,
      files: agenticResult.files,
      modelId: getGenerationModel(),
      ok: true as const,
      operations: agenticResult.operationTrace,
      outputs: [],
      sideEffects: agenticResult.touchedFiles.map((path: string) => ({
        path,
        type: "write_file",
      })),
    };
    devLog("edit", "tools.finished", {
      ok: editResult.ok,
      operations: editResult.operations.length,
      projectId: project.id,
      sideEffects: editResult.sideEffects.length,
    });

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
    const editValidation = validateGeneratedEdit({
      baseFiles,
      instruction,
      nextFiles: editResult.files,
      touchedFiles,
    });

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
            generator: "batched-edit",
            parentSnapshotId: activeSnapshot.id,
            sourceType: "edited",
          },
          generation: {
            mode: "batched-edit",
            operationTrace: editResult.operations,
            editValidation,
            skillDigestVersion: sessionSkillDigestVersion,
            skillsRead: sessionSkillsRead,
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
        message: "Pembaruan website sedang diperiksa.",
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
    const queuedArtifactRef =
      queuedBuild.buildStatus === "succeeded" &&
      isProjectArtifactRefFor(queuedBuild.artifactRef, "dist", build.id)
        ? queuedBuild.artifactRef
        : null;
    const artifactLineageValid =
      queuedBuild.buildStatus !== "succeeded" || queuedArtifactRef !== null;
    const distFiles = queuedArtifactRef
      ? await readProjectDistArtifact(queuedArtifactRef)
      : [];
    const buildResult = {
      artifactRef: queuedArtifactRef,
      distFiles,
      logText: artifactLineageValid
        ? queuedBuild.logText
        : "Build artifact does not match its build.",
      status: artifactLineageValid ? queuedBuild.buildStatus : "failed",
    };
    devLog("edit", "build.finished", {
      projectId: project.id,
      status: buildResult.status,
    });
    const buildStatus: ProjectBuildStatus = buildResult.status;
    const artifactRef = buildResult.artifactRef;
    sessionFailed = buildStatus !== "succeeded";

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
                  workspaceCard: { type: "none" },
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
        if (isSuccessfulBuildStatus(buildStatus)) {
          await persistSuccessfulBuildCheckpoint({
            buildId: build.id,
            kind: "edit",
            projectId: project.id,
            snapshotId: snapshot.id,
            store: transaction,
          });
        }
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
    sessionFailed = true;
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
  } finally {
    await appendEditSessionLog({
      failed: sessionFailed,
      skillDigestVersion: sessionSkillDigestVersion,
      skillsRead: sessionSkillsRead,
      stopped: abortSignal.aborted,
      touchedFiles: sessionTouchedFiles,
      operations: sessionOperations,
    });
  }
}
