import { getGenerationModel } from "@/lib/ai/ai-models";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { runAgenticGenerate } from "@/lib/projects/agentic-generator";
import { parseProjectBrief } from "@/lib/projects/brief";
import {
  publishBuildProgress,
  type BuildProgressEvent,
} from "@/lib/projects/build-attempt-pubsub";
import {
  isSuccessfulBuildStatus,
  persistSuccessfulBuildCheckpoint,
} from "@/lib/projects/build-checkpoint";
import { loadAcceptedHandoffForAttempt } from "@/lib/projects/build-handoffs";
import {
  classifyBuildFailure,
  getIndonesianBuildFailureSummary,
} from "@/lib/projects/build-logs";
import {
  appendBuildSessionLog,
  type BuildSessionLogOperation,
} from "@/lib/projects/build-session-log";
import { createStepCharger } from "@/lib/projects/energy-step-charger";
import { formatGeneratedSource } from "@/lib/projects/format-generated-source";
import {
  buildGeneratedProject,
  createGeneratedSourceSnapshotMetadata,
  createGeneratedViteTanStackStarterFiles,
} from "@/lib/projects/generated-source";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import { loadPersistedProjectSourceFiles } from "@/lib/projects/load-persisted-project-source";
import { createProgressiveSaver } from "@/lib/projects/progressive-save";
import {
  finalizeProjectOperation,
  renewProjectOperation,
} from "@/lib/projects/project-operation";
import { refreshProjectThumbnail } from "@/lib/projects/project-thumbnail";
import { resolveGenerateMode } from "@/lib/projects/resolve-generate-mode";
import { ensureRegisteredRouteLinks } from "@/lib/projects/route-links";
import {
  resolveArtifactFilesDir,
  writeProjectDistArtifact,
  writeProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";
import { createRuntimeEventData } from "@/lib/projects/runtime-events";
import { stopSupersededPreviewDeployments } from "@/lib/projects/runtime-supervisor";
import {
  type ProjectBuildStatus,
  type ProjectDeploymentKind,
  type ProjectDeploymentStatus,
  type ProjectSnapshotSourceType,
} from "@/lib/projects/runtime-types";
import {
  createProjectSiteSchemaFromAcceptedHandoff,
  createProjectSiteSchemaFromBrief,
} from "@/lib/projects/site-schema";

const GENERATED_SNAPSHOT_SOURCE_TYPE =
  "generated" satisfies ProjectSnapshotSourceType;
const PREVIEW_DEPLOYMENT_KIND = "preview" satisfies ProjectDeploymentKind;

export const MAX_GENERATION_ROUNDS = 3;
export const MAX_CLEAN_REBUILDS = 1;
const MAX_TRANSIENT_RETRIES = 2;

function isTransientGenerationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/timed out|timeout/i.test(message)) {
    return false;
  }
  return /fetch failed|econn|socket|network|rate limit|429/i.test(message);
}

function extractFailingFiles(log: string): string[] {
  const matches = [
    ...log.matchAll(/([A-Za-z0-9_.\-/]+\.(?:tsx|ts|css))[:\s]/g),
  ].map((match) => match[1] ?? "");
  return [...new Set(matches)].slice(0, 8);
}

type BuildAttemptContext = {
  abortSignal: AbortSignal;
  attemptId: string;
  buildId: string;
  generateMode: "first_generate" | "retry_build";
  operationToken: string;
  project: {
    id: string;
    prompt: string;
    status: string;
    generationEngine?: string;
  };
  userId: string;
};

export async function runBuildAttempt({
  abortSignal,
  attemptId,
  buildId,
  generateMode,
  operationToken,
  project,
  userId,
}: BuildAttemptContext): Promise<void> {
  const projectId = project.id;
  const projectPrompt = project.prompt;
  let runtimeBuildFinalized = false;
  let runtimeBuildId: string | null = buildId;
  let lastPersistedProgressKey: string | null = null;
  let lastPersistedOperationAt = 0;
  let persistedOperationCount = 0;
  const MAX_PERSISTED_OPERATIONS = 60;
  const OPERATION_PERSIST_MIN_MS = 250;

  function persistProgressEvent(input: {
    detail: string;
    diff?: unknown;
    label: string;
    path?: string;
  }) {
    const label = input.label.trim();
    if (!label) {
      return;
    }
    const detail = input.detail.trim() || label;
    const key = `${label}\0${detail}\0${input.path ?? ""}`;
    if (key === lastPersistedProgressKey) {
      return;
    }
    lastPersistedProgressKey = key;
    void prisma.runtimeEvent
      .create({
        data: createRuntimeEventData({
          buildId: runtimeBuildId,
          message: label,
          metadata: {
            detail,
            label,
            ...(input.path ? { path: input.path } : {}),
            ...(Array.isArray(input.diff) && input.diff.length > 0
              ? { diff: input.diff }
              : {}),
          },
          projectId,
          type: "build.progress",
        }),
      })
      .catch(() => undefined);
  }

  function send(
    event: BuildProgressEvent["type"],
    data: Record<string, unknown>,
  ) {
    // Op payloads use `type` for the tool name (write_file, …). Put channel
    const toolType =
      event === "operation" && typeof data.type === "string"
        ? data.type
        : undefined;
    const isWrite = toolType === "write_file" || toolType === "replace_in_file";
    const diff =
      isWrite && Array.isArray(data.diff) && data.diff.length > 0
        ? data.diff
        : undefined;
    publishBuildProgress(attemptId, {
      ...data,
      ...(toolType ? { tool: toolType } : {}),
      ...(diff ? { diff } : {}),
      type: event,
    });

    if (event === "progress" && "label" in data) {
      const label = String((data as { label?: unknown }).label ?? "").trim();
      const detail = String(
        (data as { detail?: unknown }).detail ?? label,
      ).trim();
      persistProgressEvent({ detail, label });
      return;
    }

    if (event === "operation" && typeof data.title === "string") {
      const title = data.title.trim();
      if (!title || persistedOperationCount >= MAX_PERSISTED_OPERATIONS) {
        return;
      }
      const path =
        typeof data.path === "string" && data.path.trim()
          ? data.path.trim()
          : undefined;
      const isWrite =
        toolType === "write_file" || toolType === "replace_in_file";
      const now = Date.now();
      // Always persist writes; throttle reads/checks so DB stays small.
      if (
        !isWrite &&
        now - lastPersistedOperationAt < OPERATION_PERSIST_MIN_MS
      ) {
        return;
      }
      lastPersistedOperationAt = now;
      persistedOperationCount += 1;
      const detailBase =
        typeof data.detail === "string" && data.detail.trim()
          ? data.detail.trim()
          : "Operasi selesai.";
      const detail = path ? `${path} — ${detailBase}` : detailBase;
      const diff =
        isWrite && Array.isArray(data.diff) && data.diff.length > 0
          ? data.diff
          : undefined;
      persistProgressEvent({ detail, diff, label: title, path });
    }
  }

  const sourceStepCharger = createStepCharger({
    userId,
    projectId,
    reason: "build:step",
    modelId: getGenerationModel(),
    recordMeta: { attemptId },
    onCharge(event) {
      send("energy", event);
    },
  });

  let agenticResult: Awaited<ReturnType<typeof runAgenticGenerate>> | null =
    null;
  let sessionFailed = true;
  let sessionStopped = false;
  let sessionSkillsRead: string[] = [];
  let sessionSkillDigestVersion: string | undefined;
  let sessionTouchedFiles: string[] = [];
  const sessionOperations: BuildSessionLogOperation[] = [];

  function captureSessionOperation(
    data: Record<string, unknown>,
    idPrefix: string,
  ): void {
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
      id: `${idPrefix}-${data.id}`,
      ...(typeof data.path === "string" ? { path: data.path } : {}),
      state,
      title: data.title,
      type: data.type,
    });
  }

  try {
    const persistedSourceFiles = await loadPersistedProjectSourceFiles({
      projectId,
      userId,
    });
    const effectiveMode = resolveGenerateMode({
      requestedMode: generateMode,
      hasPersistedSource: persistedSourceFiles.length > 0,
    });
    const usesAcceptedContract =
      project.generationEngine === "contract" ||
      project.generationEngine === "contract-v1";
    const acceptedHandoff = usesAcceptedContract
      ? await loadAcceptedHandoffForAttempt({
          attemptId,
          projectId,
          userId,
        })
      : null;
    if (usesAcceptedContract && !acceptedHandoff) {
      throw new Error("accepted handoff missing");
    }
    if (generateMode === "retry_build" && effectiveMode === "first_generate") {
      devLog("generate", "retry_build.empty_source_fallback", {
        projectId,
        requestedMode: generateMode,
      });
      send("progress", {
        label: "Menyiapkan website",
        detail: "Membuat website dari brief yang sudah siap.",
      });
    }

    if (effectiveMode === "retry_build") {
      send("progress", {
        label: "Memuat website tersimpan",
        detail: "Menyiapkan pembuatan ulang dari bagian yang sudah ada.",
      });

      const retrySchema = acceptedHandoff
        ? createProjectSiteSchemaFromAcceptedHandoff(acceptedHandoff)
        : createProjectSiteSchemaFromBrief(
            parseProjectBrief(
              (
                await prisma.$queryRaw<[{ brief: unknown }]>`
                  SELECT "brief" FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId}
                `
              )[0]?.brief,
              projectPrompt,
            ),
          );

      let sourceFiles = persistedSourceFiles;
      if (!sourceFiles.some((f) => f.path === "package.json")) {
        const starter = createGeneratedViteTanStackStarterFiles(
          projectId,
          retrySchema,
        );
        const map = new Map<string, GeneratedProjectFile>();
        for (const f of starter) {
          map.set(f.path, f);
        }
        for (const f of sourceFiles) {
          map.set(f.path, f);
        }
        sourceFiles = Array.from(map.values());
      }

      send("progress", {
        label: "Memeriksa website tersimpan",
        detail: `${sourceFiles.length} bagian dimuat untuk diperiksa.`,
      });

      // Deterministic heal: rewrite unregistered <Link to="/x"> to hash
      sourceFiles = ensureRegisteredRouteLinks(sourceFiles);

      const latestSuccessfulBuild = await prisma.projectBuild.findFirst({
        where: { projectId, status: "succeeded" },
        orderBy: { createdAt: "desc" },
        select: { snapshotId: true },
      });
      const snapshot = await prisma.projectSnapshot.create({
        data: {
          files: sourceFiles,
          metadata: createGeneratedSourceSnapshotMetadata(
            sourceFiles,
            retrySchema,
            {
              generationMode: "retry_build",
              summary: "Retry build from existing source",
            },
          ),
          projectId,
          ...(latestSuccessfulBuild?.snapshotId
            ? { parentSnapshotId: latestSuccessfulBuild.snapshotId }
            : {}),
          sourceType: GENERATED_SNAPSHOT_SOURCE_TYPE,
        },
        select: { id: true },
      });
      const sourceRef = await writeProjectSourceArtifact({
        artifactId: snapshot.id,
        files: sourceFiles,
      });
      await prisma.projectSnapshot.update({
        where: { id: snapshot.id },
        data: { sourceRef },
      });
      await prisma.projectEditAttempt.update({
        where: { id: attemptId },
        data: { snapshotId: snapshot.id },
      });

      if (runtimeBuildId) {
        await prisma.projectBuild.update({
          where: { id: runtimeBuildId },
          data: { snapshotId: snapshot.id, status: "running" },
        });
      }

      const finalBuildResult = await buildGeneratedProject(sourceFiles, {
        workspaceKey: projectId,
      });

      const buildOk =
        finalBuildResult.ok && finalBuildResult.distFiles.length > 0;
      let distRef: string | null = null;
      if (buildOk && finalBuildResult.distFiles?.length) {
        distRef = await writeProjectDistArtifact({
          artifactId: runtimeBuildId || snapshot.id,
          files: finalBuildResult.distFiles,
        });
      }

      const retryDeployment = await prisma.$transaction(
        async (transaction) => {
          const finalized = await finalizeProjectOperation({
            data: {
              buildLog: finalBuildResult.log ?? "",
              buildStatus: buildOk ? "passed" : "failed",
              ...(buildOk ? { builtAt: new Date() } : {}),
              ...(buildOk && acceptedHandoff
                ? {
                    activeHandoffId: acceptedHandoff.id,
                    brief: acceptedHandoff.briefSnapshot as object,
                  }
                : {}),
              sourceFiles: sourceFiles as object,
              status: buildOk ? "ready" : "failed",
            },
            projectId,
            store: transaction,
            token: operationToken,
            userId,
          });

          if (!finalized) {
            throw new Error("Build operation lease was superseded.");
          }

          if (runtimeBuildId) {
            await transaction.projectBuild.update({
              where: { id: runtimeBuildId },
              data: {
                finishedAt: new Date(),
                logText: finalBuildResult.log ?? "",
                status: buildOk ? "succeeded" : "failed",
                ...(distRef ? { artifactRef: distRef } : {}),
              },
            });
            if (buildOk) {
              await persistSuccessfulBuildCheckpoint({
                buildId: runtimeBuildId,
                kind: "build",
                projectId,
                snapshotId: snapshot.id,
                store: transaction,
              });
            }
          }

          await transaction.projectEditAttempt.update({
            where: { id: attemptId },
            data: {
              errorMessage: buildOk ? null : "Retry build failed.",
              finishedAt: new Date(),
              status: buildOk ? "succeeded" : "failed",
            },
          });

          if (buildOk) {
            return transaction.projectDeployment.create({
              data: {
                buildId: runtimeBuildId,
                kind: PREVIEW_DEPLOYMENT_KIND,
                projectId,
                snapshotId: snapshot.id,
                status: "running" satisfies ProjectDeploymentStatus,
              },
              select: { id: true },
            });
          }

          return null;
        },
        { timeout: 30_000 },
      );
      runtimeBuildFinalized = true;
      if (retryDeployment?.id) {
        await Promise.allSettled([
          stopSupersededPreviewDeployments({
            activeDeploymentId: retryDeployment.id,
            projectId,
          }),
        ]);
      }
      sessionFailed = !buildOk;
      sessionTouchedFiles = sourceFiles.map((file) => file.path);

      if (buildOk) {
        send("done", {
          message: "Website siap dilihat.",
          projectId,
        });
        if (distRef && runtimeBuildId) {
          void refreshProjectThumbnail({
            artifactRef: distRef,
            buildId: runtimeBuildId,
            projectId,
          }).catch(() => undefined);
        }
      } else if (!sourceStepCharger.isExhausted()) {
        // ponytail: when energy halted the build mid-loop, the
        send("progress", {
          label: "Website belum selesai",
          detail:
            "Bagian yang sudah selesai tetap tersimpan. Kamu bisa melihat detailnya di tab Kode.",
        });
        send("error", {
          message: "AI belum bisa membangun website ini.",
          // Never leak raw build logs (TS errors, [umkm:*] internals) to
          detail:
            getIndonesianBuildFailureSummary(
              classifyBuildFailure(finalBuildResult.log ?? ""),
            ) ?? "Website belum selesai dibuat.",
        });
      }

      return;
    }

    send("progress", {
      label: "Menyiapkan website",
      detail: "Membaca kebutuhan utama dari brief.",
    });

    const generateStartedAt = Date.now();
    let agentMs = 0;
    let viteMs = 0;

    const brief = acceptedHandoff
      ? parseProjectBrief(acceptedHandoff.briefSnapshot, projectPrompt)
      : parseProjectBrief(
          (
            await prisma.$queryRaw<[{ brief: unknown }]>`
              SELECT "brief" FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId}
            `
          )[0]?.brief,
          projectPrompt,
        );
    devLog("generate", "brief.parsed", {
      projectId,
      promptLength: projectPrompt.length,
      source: acceptedHandoff ? "accepted_handoff" : "project_brief",
    });
    const finalSchema = acceptedHandoff
      ? createProjectSiteSchemaFromAcceptedHandoff(acceptedHandoff)
      : createProjectSiteSchemaFromBrief(brief);

    const leaseRenewed = await renewProjectOperation({
      projectId,
      token: operationToken,
      userId,
    });

    if (!leaseRenewed) {
      throw new Error("Build operation lease was superseded.");
    }

    const saver = createProgressiveSaver({
      projectId,
      token: operationToken,
      userId,
      logContext: "generate",
    });

    const onFilesChanged = (currentFiles: GeneratedProjectFile[]) => {
      saver.save(currentFiles);
    };

    // Batched durable staging: the writer/parser stage is in-memory only, so
    const batchedStageFiles = new Map<string, GeneratedProjectFile>();
    const persistBatchedStage = (file: GeneratedProjectFile) => {
      batchedStageFiles.set(file.path, file);
      onFilesChanged([...batchedStageFiles.values()]);
    };

    const existingSourceFiles =
      generateMode === "first_generate"
        ? []
        : await loadPersistedProjectSourceFiles({
            projectId,
            userId,
          }).catch(() => []);

    const isRevision = existingSourceFiles.length > 0;

    const agentStartedAt = Date.now();
    send("progress", {
      label: "Menyiapkan pembuatan website",
      detail: isRevision
        ? "AI sedang memperbarui komponen website."
        : "AI sedang merancang arsitektur dan komponen website.",
    });

    let repairContext: {
      failingFiles: string[];
      logExcerpt: string;
    } | null = null;
    let repairRounds = 0;
    let transientRetries = 0;
    let buildResult = {
      distFiles: [] as Awaited<
        ReturnType<typeof buildGeneratedProject>
      >["distFiles"],
      log: "",
      ok: false,
    };

    for (let round = 1; round <= MAX_GENERATION_ROUNDS; round += 1) {
      let roundResult: Awaited<ReturnType<typeof runAgenticGenerate>>;
      try {
        roundResult = await runAgenticGenerate({
          abortSignal,
          attemptId,
          brief: {
            ...brief,
            factLedger: acceptedHandoff?.briefSnapshot.factLedger,
            discussionContext: acceptedHandoff?.briefSnapshot.discussionContext,
          },
          buildContract: acceptedHandoff?.contract,
          buildId: runtimeBuildId,
          buildPlan: acceptedHandoff?.plan,
          initialFiles:
            existingSourceFiles.length > 0 ? existingSourceFiles : undefined,
          onEvent: (type, data) => {
            if (type === "operation") {
              captureSessionOperation(data, `round-${round}`);
            }
            send(type, data);
          },
          onFileStaged: persistBatchedStage,
          operationToken,
          projectId,
          repairContext,
          schema: finalSchema,
          stepCharger: sourceStepCharger,
          userId,
        });
      } catch (error) {
        if (
          transientRetries < MAX_TRANSIENT_RETRIES &&
          isTransientGenerationError(error)
        ) {
          transientRetries += 1;
          round -= 1;
          continue;
        }
        throw error;
      }
      agenticResult = roundResult;
      sessionSkillsRead = [
        ...new Set([...sessionSkillsRead, ...roundResult.skillsRead]),
      ];
      sessionSkillDigestVersion =
        roundResult.skillDigest?.version ?? sessionSkillDigestVersion;
      sessionTouchedFiles = [
        ...new Set([...sessionTouchedFiles, ...roundResult.touchedFiles]),
      ];
      if (
        !sessionOperations.some((operation) =>
          operation.id.startsWith(`round-${round}-`),
        )
      ) {
        sessionOperations.push(
          ...roundResult.operationTrace.map((operation) => ({
            ...operation,
            id: `round-${round}-${operation.id}`,
          })),
        );
      }
      repairRounds = round;
      buildResult = await buildGeneratedProject(agenticResult.files, {
        workspaceKey: projectId,
      });
      if (
        (buildResult.ok && buildResult.distFiles.length > 0) ||
        sourceStepCharger.isExhausted()
      ) {
        break;
      }
      if (round < MAX_GENERATION_ROUNDS) {
        send("progress", {
          label: "Merapikan website",
          detail: "Ada bagian yang belum kompilasi. AI sedang memperbaikinya.",
        });
        repairContext = {
          failingFiles: extractFailingFiles(buildResult.log ?? ""),
          logExcerpt: (buildResult.log ?? "").slice(-4_000),
        };
      }
    }

    if (
      (!buildResult.ok || buildResult.distFiles.length === 0) &&
      agenticResult &&
      !sourceStepCharger.isExhausted()
    ) {
      for (let clean = 0; clean < MAX_CLEAN_REBUILDS; clean += 1) {
        buildResult = await buildGeneratedProject(agenticResult.files, {
          workspaceKey: projectId,
        });
        if (buildResult.ok && buildResult.distFiles.length > 0) {
          break;
        }
      }
    }

    if (!agenticResult) {
      throw new Error("Agent did not produce any generation round.");
    }

    const generationOutput = {
      energyExhausted: sourceStepCharger.isExhausted(),
      files: agenticResult.files,
      generationMode: "agentic" as const,
      operationTrace: agenticResult.operationTrace,
      repairRounds,
      skillDigest: agenticResult.skillDigest,
      skillDigestVersion: sessionSkillDigestVersion,
      skillsRead: sessionSkillsRead,
      summary: agenticResult.summary,
      touchedFiles: agenticResult.touchedFiles,
    };

    const sourceGeneration = generationOutput;
    agentMs = Date.now() - agentStartedAt;
    if (sourceGeneration.energyExhausted) {
      send("energy_exhausted", {
        message:
          "Energi kamu habis di tengah proses. File yang sudah dibuat tetap tersimpan — isi ulang energi untuk melanjutkan.",
      });
    }
    await saver.flush();
    devLog("generate", "source.generated", {
      files: sourceGeneration.files.length,
      mode: sourceGeneration.generationMode,
      projectId: projectId,
      touchedFiles: sourceGeneration.touchedFiles.length,
    });
    const sourceFiles = sourceGeneration.files;
    const sourceLeaseRenewed = await renewProjectOperation({
      projectId,
      token: operationToken,
      userId,
    });

    if (!sourceLeaseRenewed) {
      throw new Error("Build operation lease was superseded.");
    }

    send("progress", {
      label: "Bagian website sudah siap",
      detail: `${sourceGeneration.touchedFiles.length} bagian website selesai dibuat.`,
    });
    const snapshot = await prisma.projectSnapshot.create({
      data: {
        files: sourceFiles,
        metadata: createGeneratedSourceSnapshotMetadata(
          sourceFiles,
          finalSchema,
          sourceGeneration,
        ),
        projectId: projectId,
        sourceType: GENERATED_SNAPSHOT_SOURCE_TYPE,
      },
      select: { id: true },
    });
    const sourceRef = await writeProjectSourceArtifact({
      artifactId: snapshot.id,
      files: sourceFiles,
    });
    await prisma.projectEditAttempt.update({
      where: { id: attemptId },
      data: { snapshotId: snapshot.id, status: "building" },
    });
    await prisma.projectSnapshot.update({
      where: { id: snapshot.id },
      data: { sourceRef },
    });
    await prisma.runtimeEvent.create({
      data: createRuntimeEventData({
        metadata: { sourceFileCount: sourceFiles.length, sourceRef },
        projectId: projectId,
        type: "snapshot.created",
      }),
    });

    const build = runtimeBuildId
      ? await prisma.projectBuild.update({
          where: { id: runtimeBuildId },
          data: {
            snapshotId: snapshot.id,
            startedAt: new Date(),
            status: "running" satisfies ProjectBuildStatus,
          },
          select: { id: true },
        })
      : await prisma.projectBuild.create({
          data: {
            projectId: projectId,
            snapshotId: snapshot.id,
            startedAt: new Date(),
            status: "running" satisfies ProjectBuildStatus,
          },
          select: { id: true },
        });
    runtimeBuildId = build.id;
    await prisma.projectEditAttempt.update({
      where: { id: attemptId },
      data: { buildId: build.id, snapshotId: snapshot.id },
    });
    send("progress", {
      label: "Memeriksa website",
      detail: "Memeriksa file website sebelum ditampilkan.",
    });
    await prisma.runtimeEvent.create({
      data: createRuntimeEventData({
        buildId: build.id,
        projectId: projectId,
        type: "build.started",
      }),
    });
    viteMs = Date.now() - agentStartedAt;
    devLog("generate", "build.finished", {
      ok: buildResult.ok,
      repairRounds,
      transientRetries,
      projectId: projectId,
    });

    const finalBuildResult = buildResult;
    const finalBuildOk =
      finalBuildResult.ok && finalBuildResult.distFiles.length > 0;
    sessionFailed = !finalBuildOk;
    devLog("generate", "timings", {
      projectId,
      agentMs,
      viteMs,
      totalMs: Date.now() - generateStartedAt,
      ok: finalBuildOk,
    });

    if (finalBuildOk) {
      send("progress", {
        label: "Build website selesai",
        detail: "File website berhasil dikompilasi.",
      });
    } else if (!sourceGeneration.energyExhausted) {
      // ponytail: on energy exhaustion the energy_exhausted event at :836
      send("progress", {
        label: "Website belum selesai",
        detail:
          "Bagian yang sudah selesai tetap tersimpan. Kamu bisa melihat detailnya di tab Kode.",
      });
    }
    const latestProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    });

    if (latestProject?.status === "stopping") {
      await prisma.$transaction(
        async (transaction) => {
          const finalized = await finalizeProjectOperation({
            data: { buildStatus: "stopped", status: "draft" },
            projectId,
            store: transaction,
            token: operationToken,
            userId,
          });

          if (!finalized) {
            throw new Error("Build operation lease was superseded.");
          }

          await transaction.projectBuild.update({
            where: { id: build.id },
            data: {
              finishedAt: new Date(),
              logText: buildResult.log,
              status: "canceled" satisfies ProjectBuildStatus,
            },
          });
          await transaction.projectEditAttempt.update({
            where: { id: attemptId },
            data: { finishedAt: new Date(), status: "canceled" },
          });
        },
        { timeout: 30_000 },
      );
      runtimeBuildFinalized = true;
      sessionFailed = true;
      sessionStopped = true;
      await prisma.runtimeEvent
        .create({
          data: createRuntimeEventData({
            buildId: build.id,
            message: "Pembuatan website dihentikan oleh kamu.",
            projectId: projectId,
            type: "build.canceled",
          }),
        })
        .catch(() => undefined);
      send("error", { message: "Proses dihentikan." });
      return;
    }

    const projectBuildStatus: ProjectBuildStatus = finalBuildOk
      ? "succeeded"
      : "failed";
    const artifactRef = finalBuildOk
      ? await writeProjectDistArtifact({
          artifactId: build.id,
          files: finalBuildResult.distFiles,
        })
      : null;
    const deploymentStatus: ProjectDeploymentStatus = finalBuildResult.ok
      ? "created"
      : "failed";
    const deployment = await prisma.$transaction(
      async (transaction) => {
        const finalized = await finalizeProjectOperation({
          data: {
            buildLog: finalBuildResult.log,
            buildStatus: finalBuildResult.ok ? "passed" : "failed",
            ...(finalBuildResult.ok ? { workspaceCard: { type: "none" } } : {}),
            ...(finalBuildResult.ok && acceptedHandoff
              ? {
                  activeHandoffId: acceptedHandoff.id,
                  brief: acceptedHandoff.briefSnapshot as object,
                }
              : {}),
            builtAt: new Date(),
            distFiles: finalBuildResult.distFiles,
            siteSchema: finalSchema,
            sourceFiles,
            status: finalBuildResult.ok ? "ready" : "failed",
          },
          projectId,
          store: transaction,
          token: operationToken,
          userId,
        });

        if (!finalized) {
          throw new Error("Build operation lease was superseded.");
        }

        await transaction.projectBuild.update({
          where: { id: build.id },
          data: {
            artifactRef,
            finishedAt: new Date(),
            logText: finalBuildResult.log,
            status: projectBuildStatus,
          },
        });
        if (isSuccessfulBuildStatus(projectBuildStatus)) {
          await persistSuccessfulBuildCheckpoint({
            buildId: build.id,
            kind: "build",
            projectId,
            snapshotId: snapshot.id,
            store: transaction,
          });
        }
        const committedDeployment = await transaction.projectDeployment.create({
          data: {
            buildId: build.id,
            kind: PREVIEW_DEPLOYMENT_KIND,
            projectId: projectId,
            publicPath: `/api/projects/${projectId}/preview`,
            snapshotId: snapshot.id,
            status: deploymentStatus,
          },
          select: { id: true },
        });
        await transaction.projectEditAttempt.update({
          where: { id: attemptId },
          data: {
            errorMessage: finalBuildResult.ok
              ? null
              : "Website belum selesai dibuat.",
            finishedAt: new Date(),
            status: finalBuildResult.ok ? "succeeded" : "failed",
          },
        });

        return committedDeployment;
      },
      { timeout: 30_000 },
    );
    runtimeBuildFinalized = true;

    await Promise.allSettled([
      prisma.runtimeEvent.create({
        data: createRuntimeEventData({
          buildId: build.id,
          message: finalBuildResult.ok
            ? "Website selesai dibuat dan siap dilihat."
            : "Website belum selesai dibuat.",
          metadata: artifactRef ? { artifactRef } : undefined,
          projectId: projectId,
          type: finalBuildResult.ok ? "build.succeeded" : "build.failed",
        }),
      }),
      prisma.runtimeEvent.create({
        data: createRuntimeEventData({
          buildId: build.id,
          deploymentId: deployment.id,
          projectId: projectId,
          type: finalBuildResult.ok
            ? "deployment.created"
            : "deployment.failed",
        }),
      }),
    ]);

    if (artifactRef) {
      const sourceDir = sourceRef ? resolveArtifactFilesDir(sourceRef) : null;
      await Promise.allSettled([
        refreshProjectThumbnail({
          artifactRef,
          buildId: build.id,
          projectId,
        }),
        stopSupersededPreviewDeployments({
          activeDeploymentId: deployment.id,
          projectId,
        }),
        // Best-effort prettier sweep over the generated source so the code
        ...(sourceDir ? [formatGeneratedSource(sourceDir)] : []),
      ]);
    }

    if (!finalBuildOk && !sourceGeneration.energyExhausted) {
      // ponytail: when energy halted the build, the energy_exhausted event
      send("error", {
        message:
          "Website belum berhasil dibuat. Coba buat ulang website setelah mengecek brief.",
      });
      return;
    }

    if (!finalBuildOk) {
      return;
    }

    send("progress", {
      label: "Website siap dilihat",
      detail: "Website sudah selesai dibuat dan siap ditinjau.",
    });
    sessionFailed = false;
    devLog("generate", "done", { projectId: projectId });
    send("done", { finalSchema });
  } catch (error) {
    sessionFailed = true;
    const rawErrorMessage =
      error instanceof Error ? error.message : String(error);
    devLog("generate", "error", {
      error: rawErrorMessage,
      projectId: projectId,
    });
    const logText = `Build route failed before completion: ${rawErrorMessage}`;
    if (runtimeBuildId && !runtimeBuildFinalized) {
      await prisma.projectBuild
        .update({
          where: { id: runtimeBuildId },
          data: {
            finishedAt: new Date(),
            logText,
            status: "failed" satisfies ProjectBuildStatus,
          },
        })
        .catch(() => undefined);
      await prisma.runtimeEvent
        .create({
          data: createRuntimeEventData({
            buildId: runtimeBuildId,
            message: logText,
            projectId: projectId,
            type: "build.failed",
          }),
        })
        .catch(() => undefined);
    }
    await Promise.allSettled([
      finalizeProjectOperation({
        data: { buildStatus: "failed", status: "failed" },
        projectId,
        token: operationToken,
        userId,
      }),
      prisma.projectEditAttempt.updateMany({
        where: {
          finishedAt: null,
          id: attemptId,
          status: { in: ["generating", "building"] },
        },
        data: {
          errorMessage: logText,
          finishedAt: new Date(),
          status: "failed",
        },
      }),
    ]);
    const emptyAgent =
      /invalid source|home route was not written|home route is still the starter|did not edit any|did not edit enough/i.test(
        rawErrorMessage,
      );
    send("error", {
      message: emptyAgent
        ? "Website belum selesai dibuat."
        : "Website belum berhasil dibuat.",
      // Never surface raw exception text to the end user (may contain
      detail: emptyAgent
        ? "Belum ada bagian website yang berhasil ditulis. Coba buat ulang website — biasanya berhasil di percobaan berikutnya."
        : "Coba buat ulang website.",
    });
  } finally {
    await appendBuildSessionLog({
      attemptId,
      failed: sessionFailed,
      kind: "build",
      projectId,
      skillDigestVersion: sessionSkillDigestVersion,
      skillsRead: sessionSkillsRead,
      stopped: sessionStopped || abortSignal.aborted,
      touchedFiles: sessionTouchedFiles,
      operations: sessionOperations,
      userId,
    }).catch(() => undefined);
  }
}
