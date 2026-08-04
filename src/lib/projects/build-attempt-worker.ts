import { generateText } from "ai";

import {
  getAiModel,
  getAiTelemetry,
  getNoReasoningCallOptions,
} from "@/lib/ai";
import {
  classifyAiError,
  recordAiCall,
  startAiCallTimer,
} from "@/lib/ai-call-record";
import { getGenerationModel } from "@/lib/ai-models";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import { getSettingSync } from "@/lib/app-settings";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import { runBatchedGenerate } from "@/lib/projects/batched-generator";
import {
  isBatchedRolloutValue,
  isBatchedWriterRolledOut,
} from "@/lib/projects/batched-rollout";
import { briefToBuildPrompt, parseProjectBrief } from "@/lib/projects/brief";
import { BatchedAdmissionBlockedError } from "@/lib/projects/brief-admission";
import {
  publishBuildProgress,
  type BuildProgressEvent,
} from "@/lib/projects/build-attempt-pubsub";
import {
  classifyBuildFailure,
  getIndonesianBuildFailureSummary,
} from "@/lib/projects/build-logs";
import {
  generateCustomProjectFilesWithAgent,
  repairGeneratedProjectFiles,
} from "@/lib/projects/custom-source-generator";
import { createStepCharger } from "@/lib/projects/energy-step-charger";
import { formatGeneratedSource } from "@/lib/projects/format-generated-source";
import {
  buildGeneratedProject,
  createGeneratedSourceSnapshotMetadata,
} from "@/lib/projects/generated-source";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";
import {
  buildImplementationSpecPrompt,
  implementationSpecFromBrief,
  implementationSpecTool,
  implementationSpecToSiteSchema,
  parseImplementationSpec,
} from "@/lib/projects/implementation-spec";
import { loadPersistedProjectSourceFiles } from "@/lib/projects/load-persisted-project-source";
import { createProgressiveSaver } from "@/lib/projects/progressive-save";
import {
  finalizeProjectOperation,
  renewProjectOperation,
} from "@/lib/projects/project-operation";
import { refreshProjectThumbnail } from "@/lib/projects/project-thumbnail";
import { resolveGenerateMode } from "@/lib/projects/resolve-generate-mode";
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
import { projectSiteGenerationSystemPrompt } from "@/lib/projects/site-generation";
import { createProjectSiteSchemaFromBrief } from "@/lib/projects/site-schema";
import { chargeEnergyForAiUsage } from "@/lib/user-credits";
import { isAdminEmail } from "@/lib/waitlist";

const GENERATED_SNAPSHOT_SOURCE_TYPE =
  "generated" satisfies ProjectSnapshotSourceType;
const PREVIEW_DEPLOYMENT_KIND = "preview" satisfies ProjectDeploymentKind;

type BuildAttemptContext = {
  abortSignal: AbortSignal;
  attemptId: string;
  buildId: string;
  generateMode: "first_generate" | "retry_build";
  operationToken: string;
  project: { id: string; prompt: string; status: string };
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
    // event type last so it is not clobbered; surface tool name as `tool`.
    const toolType =
      event === "operation" && typeof data.type === "string"
        ? data.type
        : undefined;
    publishBuildProgress(attemptId, {
      ...data,
      ...(toolType ? { tool: toolType } : {}),
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

  let specInputTokens = 0;
  let specOutputTokens = 0;
  let specModelId: string | undefined;
  let specAttempts = 0;
  let energyCharged = false;

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

  const flushGenerateEnergy = async () => {
    if (energyCharged) {
      return;
    }
    energyCharged = true;
    const fallbackModelId = getGenerationModel();
    if (specInputTokens > 0 || specOutputTokens > 0) {
      await chargeEnergyForAiUsage({
        userId,
        modelId: specModelId || fallbackModelId,
        inputTokens: specInputTokens,
        outputTokens: specOutputTokens,
        reason: "build:spec",
      });
    }
  };

  try {
    const persistedSourceFiles = await loadPersistedProjectSourceFiles({
      projectId,
      userId,
    });
    const effectiveMode = resolveGenerateMode({
      requestedMode: generateMode,
      hasPersistedSource: persistedSourceFiles.length > 0,
    });
    if (generateMode === "retry_build" && effectiveMode === "first_generate") {
      devLog("generate", "retry_build.empty_source_fallback", {
        projectId,
        requestedMode: generateMode,
      });
      send("progress", {
        label: "Source belum ada",
        detail: "Menjalankan build pertama dari brief yang sudah siap.",
      });
    }

    if (effectiveMode === "retry_build") {
      send("progress", {
        label: "Memuat source tersimpan",
        detail: "Membangun ulang dari file tersimpan.",
      });

      let sourceFiles = persistedSourceFiles;

      send("progress", {
        label: "Build website dari source tersimpan",
        detail: `${sourceFiles.length} file dimuat. Validasi build.`,
      });

      const [retryBriefRow] = await prisma.$queryRaw<[{ brief: unknown }]>`
      SELECT "brief" FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId}
    `;
      const retryBrief = parseProjectBrief(retryBriefRow?.brief, projectPrompt);
      const retrySchema = createProjectSiteSchemaFromBrief(retryBrief);

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

      if (runtimeBuildId) {
        await prisma.projectBuild.update({
          where: { id: runtimeBuildId },
          data: { snapshotId: snapshot.id, status: "running" },
        });
      }

      let finalBuildResult = await buildGeneratedProject(sourceFiles, {
        workspaceKey: projectId,
      });

      if (!finalBuildResult.ok && !sourceStepCharger.isExhausted()) {
        for (let repairAttempt = 0; repairAttempt < 2; repairAttempt++) {
          const renewed = await renewProjectOperation({
            projectId,
            token: operationToken,
            userId,
          });
          if (!renewed) {
            throw new Error("Build operation lease was superseded.");
          }
          send("progress", {
            label: "AI memperbaiki kode",
            detail: `Perbaikan ${repairAttempt + 1}/2. Memperbaiki error build.`,
          });
          try {
            const repair = await repairGeneratedProjectFiles({
              buildLog: finalBuildResult.log,
              files: sourceFiles,
              onOperation(op) {
                send("operation", op);
              },
              projectId,
              schema: retrySchema,
              stepCharger: sourceStepCharger,
            });
            sourceFiles = repair.files;
            await prisma.projectSnapshot.update({
              where: { id: snapshot.id },
              data: {
                files: sourceFiles,
                metadata: createGeneratedSourceSnapshotMetadata(
                  sourceFiles,
                  retrySchema,
                  {
                    generationMode: "retry_build",
                    repairAttempts: repairAttempt + 1,
                    summary: "Retry build repair",
                  },
                ),
              },
            });
            await writeProjectSourceArtifact({
              artifactId: snapshot.id,
              files: sourceFiles,
            }).catch(() => undefined);
            finalBuildResult = await buildGeneratedProject(sourceFiles, {
              workspaceKey: projectId,
            });
            if (finalBuildResult.ok) {
              break;
            }
          } catch (repairError) {
            devLog("generate", "build.repair.error", {
              attempt: repairAttempt + 1,
              message:
                repairError instanceof Error
                  ? repairError.message
                  : String(repairError),
              mode: "retry_build",
            });
          }
        }
      }

      const buildOk = finalBuildResult.ok;
      let distRef: string | null = null;
      if (buildOk && finalBuildResult.distFiles?.length) {
        distRef = await writeProjectDistArtifact({
          artifactId: runtimeBuildId || snapshot.id,
          files: finalBuildResult.distFiles,
        });
      }

      await prisma.$transaction(
        async (transaction) => {
          const finalized = await finalizeProjectOperation({
            data: {
              buildLog: finalBuildResult.log ?? "",
              buildStatus: buildOk ? "ready" : "failed",
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
            await transaction.projectDeployment.create({
              data: {
                buildId: runtimeBuildId,
                kind: PREVIEW_DEPLOYMENT_KIND,
                projectId,
                snapshotId: snapshot.id,
                status: "running" satisfies ProjectDeploymentStatus,
              },
            });
          }
        },
        { timeout: 30_000 },
      );
      runtimeBuildFinalized = true;

      if (buildOk) {
        send("done", {
          message: "Build ulang berhasil.",
          projectId,
        });
        void refreshProjectThumbnail({
          artifactRef: distRef ?? snapshot.id,
          buildId: runtimeBuildId ?? snapshot.id,
          projectId,
        }).catch(() => undefined);
      } else if (!sourceStepCharger.isExhausted()) {
        // ponytail: when energy halted the build mid-loop, the
        // energy_exhausted informational event is the user-facing truth;
        // skip the contradicting "Build website gagal" failure message.
        send("progress", {
          label: "Build website gagal",
          detail: "File disimpan. Silakan cek log di tab Kode.",
        });
        send("error", {
          message: "AI belum bisa membangun website ini.",
          // Never leak raw build logs (TS errors, [umkm:*] internals) to
          // the end user. Send the safe Indonesian summary derived from
          // the classified failure reason; the full log stays in the DB
          // logText for the operator's "Kode" tab.
          detail:
            getIndonesianBuildFailureSummary(
              classifyBuildFailure(finalBuildResult.log ?? ""),
            ) ?? "Build gagal.",
        });
      }

      await flushGenerateEnergy();
      return;
    }

    send("progress", {
      label: "Memahami usaha dan target pembeli",
      detail: "Membaca kebutuhan utama dari brief.",
    });

    const generateStartedAt = Date.now();
    let specMs = 0;
    let agentMs = 0;
    let viteMs = 0;
    let repairMs = 0;
    let repairAttemptsUsed = 0;

    const [briefRow] = await prisma.$queryRaw<[{ brief: unknown }]>`
    SELECT "brief" FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId}
  `;
    const brief = parseProjectBrief(briefRow?.brief, projectPrompt);
    devLog("generate", "brief.parsed", {
      projectId,
      promptLength: projectPrompt.length,
    });
    const buildPrompt = briefToBuildPrompt(brief);

    async function generateImplementationSpec(prompt: string) {
      const system =
        projectSiteGenerationSystemPrompt +
        "\n\nCall the presentImplementationSpec tool exactly once with the full spec. Never reply with plain text or JSON in chat.";

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let lastModelId: string | undefined;

      const attemptSpec = async (maxTokens: number) => {
        // Real tool-calling (not prompt-based JSON mode) — 9Router combo
        // models emit malformed pseudo-XML wrappers under Output.json().
        const abortController = new AbortController();
        const timeoutMs = getAiTimeoutMs("buildSpec");
        const timeout = setTimeout(() => abortController.abort(), timeoutMs);
        specAttempts += 1;
        const thisAttempt = specAttempts;
        const stopSpecTimer = startAiCallTimer();
        const specRequestedModel = getGenerationModel();

        let result;
        try {
          result = await generateText({
            model: getAiModel(specRequestedModel),
            maxRetries: 2,
            maxOutputTokens: maxTokens,
            temperature: 0.35,
            abortSignal: abortSignal,
            instructions: system,
            prompt,
            tools: {
              presentImplementationSpec: implementationSpecTool,
            },
            toolChoice: {
              type: "tool",
              toolName: "presentImplementationSpec",
            },
            ...getNoReasoningCallOptions(),
            telemetry: getAiTelemetry("project-implementation-spec", {
              projectId,
              route: "api.projects.generate",
              userId,
            }),
          });
        } catch (error) {
          recordAiCall({
            attemptId,
            buildId: runtimeBuildId ?? undefined,
            errorClass: classifyAiError(error),
            modelRequested: specRequestedModel,
            projectId,
            requestMs: stopSpecTimer().requestMs,
            retryCount: thisAttempt - 1,
            status: "error",
            task: "build-spec",
          });
          throw error;
        } finally {
          clearTimeout(timeout);
        }

        recordAiCall({
          attemptId,
          buildId: runtimeBuildId ?? undefined,
          inputTokens: result.usage?.inputTokens ?? undefined,
          modelRequested: specRequestedModel,
          modelServed: result.response?.modelId,
          outputTokens: result.usage?.outputTokens ?? undefined,
          projectId,
          requestMs: stopSpecTimer().requestMs,
          retryCount: thisAttempt - 1,
          status: "ok",
          task: "build-spec",
        });

        const usage = result.usage;
        const toolCall = result.toolCalls?.[0] as
          { input?: unknown; args?: unknown } | undefined;
        const rawOutput = toolCall?.input ?? toolCall?.args ?? null;
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        lastModelId = result.response.modelId;
        devLog("generate", "spec.attempt", {
          projectId,
          maxTokens,
          finishReason: result.finishReason,
          contentLength: result.text.length,
          inputTokens,
          outputTokens,
        });

        const spec = parseImplementationSpec(rawOutput);

        return {
          spec,
          inputTokens,
          outputTokens,
          finishReason: result.finishReason,
          modelId: result.response.modelId,
        };
      };

      try {
        const attempt1 = await attemptSpec(4_096);
        if (attempt1.spec) {
          return {
            spec: attempt1.spec,
            source: "ai" as const,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            modelId: attempt1.modelId,
          };
        }
      } catch (error) {
        devLog("generate", "spec.error", {
          error:
            error instanceof Error
              ? error.message
              : typeof error === "object" && error
                ? JSON.stringify(error)
                : String(error),
          projectId,
          attempt: 1,
        });
      }

      send("progress", {
        label: "AI mencoba sekali lagi",
        detail: "Merancang ulang struktur halaman.",
      });
      await new Promise((resolve) => setTimeout(resolve, 2_000));

      try {
        const attempt2 = await attemptSpec(8_192);
        if (attempt2.spec) {
          return {
            spec: attempt2.spec,
            source: "ai" as const,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            modelId: attempt2.modelId,
          };
        }
      } catch (error) {
        devLog("generate", "spec.error", {
          error:
            error instanceof Error
              ? error.message
              : typeof error === "object" && error
                ? JSON.stringify(error)
                : String(error),
          projectId,
          attempt: 2,
        });
      }

      const fallbackSpec = implementationSpecFromBrief(brief);
      if (!parseImplementationSpec(fallbackSpec)) {
        throw new Error(
          "AI implementation spec was invalid after retries and brief fallback failed.",
        );
      }

      send("progress", {
        label: "Rancangan AI tidak lengkap",
        detail: "Melanjutkan dengan rancangan dari brief.",
      });
      send("progress", {
        label: "Pakai rancangan dari brief",
        detail: "Menyusun landing page dari data usaha.",
      });
      devLog("generate", "spec.fallback", {
        projectId,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });

      return {
        spec: fallbackSpec,
        source: "brief_fallback" as const,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        modelId: lastModelId,
      };
    }

    const implementationSpecPrompt = buildImplementationSpecPrompt(brief);
    const specStartedAt = Date.now();
    const specResult = await generateImplementationSpec(
      implementationSpecPrompt,
    );
    specMs = Date.now() - specStartedAt;
    const implementationSpec = specResult.spec;
    specInputTokens = specResult.inputTokens;
    specOutputTokens = specResult.outputTokens;
    specModelId = specResult.modelId;
    const specLeaseRenewed = await renewProjectOperation({
      projectId,
      token: operationToken,
      userId,
    });

    if (!specLeaseRenewed) {
      throw new Error("Build operation lease was superseded.");
    }

    const finalSchema = implementationSpecToSiteSchema(implementationSpec);
    send("progress", {
      label: "AI menulis website",
      detail: "Agent coding menulis file source.",
    });

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
    // write each file through to Project.sourceFiles the moment its block
    // closes — same progressive-saver the legacy agent loop uses. A worker
    // crash mid-stream then leaves every completed file persisted, not lost.
    // ponytail: writes the whole array per file O(n²); the saver queues
    // serially so it stays correct — switch to per-file patch rows if this
    // ever shows up in profiles.
    const batchedStageFiles = new Map<string, GeneratedProjectFile>();
    const persistBatchedStage = (file: GeneratedProjectFile) => {
      batchedStageFiles.set(file.path, file);
      onFilesChanged([...batchedStageFiles.values()]);
    };

    const agentStartedAt = Date.now();
    // Batched rollout: flag-on owners run the single-shot writer; any
    // batched failure (parse, gates, repair budget) falls back to the legacy
    // agent loop within the same attempt — never user-visible breakage.
    const batchedRolloutRaw: string = getSettingSync(
      "generation.batched_rollout",
      "off",
    );
    const batchedRollout = isBatchedRolloutValue(batchedRolloutRaw)
      ? batchedRolloutRaw
      : "off";
    let batchedIsAdmin = false;
    if (batchedRollout === "internal") {
      const owner = await prisma.user
        .findUnique({ where: { id: userId }, select: { email: true } })
        .catch(() => null);
      batchedIsAdmin = owner?.email ? isAdminEmail(owner.email) : false;
    }
    const useBatched = isBatchedWriterRolledOut({
      isAdmin: batchedIsAdmin,
      projectId,
      rollout: batchedRollout,
    });

    let sourceGeneration: Awaited<
      ReturnType<typeof generateCustomProjectFilesWithAgent>
    >;
    if (useBatched) {
      try {
        const batched = await runBatchedGenerate({
          abortSignal,
          attemptId,
          brief,
          buildId: runtimeBuildId,
          implementationSpec,
          onEvent(type, data) {
            send(type, data);
          },
          onFileStaged: persistBatchedStage,
          projectId,
          schema: finalSchema,
          stepCharger: sourceStepCharger,
          userId,
        });

        if (batched.ok) {
          const touched = batched.writtenPaths;
          sourceGeneration = {
            buildSpec: buildPrompt,
            energyExhausted: sourceStepCharger.isExhausted(),
            files: batched.files,
            generationMode: "agent-custom",
            operationTrace: [],
            repairAttempts: batched.repairRounds,
            summary: batched.summary,
            touchedFiles: touched,
          };
        } else {
          devLog("generate", "batched.fallback", {
            projectId,
            reason: batched.reason,
            repairRounds: batched.repairRounds,
          });
          sourceGeneration = await generateCustomProjectFilesWithAgent({
            implementationBrief: buildPrompt,
            implementationSpec,
            onOperation(operation) {
              send("operation", operation);
            },
            projectId,
            schema: finalSchema,
            onFilesChanged,
            abortSignal,
            stepCharger: sourceStepCharger,
          });
          recordAiCall({
            attemptId,
            buildId: runtimeBuildId ?? undefined,
            modelRequested: getGenerationModel(),
            phase: "fallback",
            projectId,
            status: "ok",
            task: "build-step",
          });
        }
      } catch (error) {
        if (error instanceof BatchedAdmissionBlockedError) {
          // Admission gate divergence: discuss-readiness may have accepted
          // this brief via fieldState (declined/explicitly_empty) while the
          // independent zod gate blocks it. Never abort — the user still
          // gets their site via the legacy agent loop; the block only keeps
          // this brief off the batched path.
          devLog("generate", "batched.admission-fallback", {
            blockers: error.blockers,
            projectId,
            reason: error.reason,
          });
          sourceGeneration = await generateCustomProjectFilesWithAgent({
            implementationBrief: buildPrompt,
            implementationSpec,
            onOperation(operation) {
              send("operation", operation);
            },
            projectId,
            schema: finalSchema,
            onFilesChanged,
            abortSignal,
            stepCharger: sourceStepCharger,
          });
          recordAiCall({
            attemptId,
            buildId: runtimeBuildId ?? undefined,
            modelRequested: getGenerationModel(),
            phase: "fallback",
            projectId,
            status: "ok",
            task: "build-step",
          });
        } else if (
          // User cancel: never fall back — rethrow so the attempt aborts.
          (error instanceof Error && error.name === "AbortError") ||
          abortSignal?.aborted
        ) {
          throw error;
        } else {
          devLog("generate", "batched.error-fallback", {
            error: error instanceof Error ? error.message : String(error),
            projectId,
          });
          sourceGeneration = await generateCustomProjectFilesWithAgent({
            implementationBrief: buildPrompt,
            implementationSpec,
            onOperation(operation) {
              send("operation", operation);
            },
            projectId,
            schema: finalSchema,
            onFilesChanged,
            abortSignal,
            stepCharger: sourceStepCharger,
          });
          recordAiCall({
            attemptId,
            buildId: runtimeBuildId ?? undefined,
            modelRequested: getGenerationModel(),
            phase: "fallback",
            projectId,
            status: "ok",
            task: "build-step",
          });
        }
      }
    } else {
      sourceGeneration = await generateCustomProjectFilesWithAgent({
        implementationBrief: buildPrompt,
        implementationSpec,
        onOperation(operation) {
          send("operation", operation);
        },
        projectId: projectId,
        schema: finalSchema,
        onFilesChanged,
        abortSignal: abortSignal,
        stepCharger: sourceStepCharger,
      });
    }
    agentMs = Date.now() - agentStartedAt;
    if (sourceGeneration.energyExhausted) {
      send("energy_exhausted", {
        message:
          "Energi kamu habis di tengah proses. File yang sudah dibuat tetap tersimpan — isi ulang energi untuk melanjutkan.",
      });
    }
    await saver.flush();
    devLog("generate", "source.generated", {
      buildSpecLength: sourceGeneration.buildSpec.length,
      files: sourceGeneration.files.length,
      mode: sourceGeneration.generationMode,
      projectId: projectId,
      touchedFiles: sourceGeneration.touchedFiles.length,
      partial: sourceGeneration.partial,
    });
    let sourceFiles = sourceGeneration.files;
    const isPartial = sourceGeneration.partial === true;
    const sourceLeaseRenewed = await renewProjectOperation({
      projectId,
      token: operationToken,
      userId,
    });

    if (!sourceLeaseRenewed) {
      throw new Error("Build operation lease was superseded.");
    }

    send("progress", {
      label: "Source siap di-build",
      detail: `${sourceGeneration.touchedFiles.length} file ditulis agent.`,
    });
    if (sourceGeneration.repairAttempts > 0) {
      send("operation", {
        detail: `${sourceGeneration.repairAttempts} perbaikan build.`,
        id: `repair-${sourceGeneration.repairAttempts}`,
        state: "succeeded",
        title: "AI memperbaiki build",
        type: "check_app",
      });
    }
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

    if (isPartial) {
      send("progress", {
        label: "AI belum selesai menulis file",
        detail: "Melanjutkan build dengan file hasil penulisan.",
      });
    }

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
      label: "Build masuk antrean",
      detail: "Memvalidasi file website.",
    });
    await prisma.runtimeEvent.create({
      data: createRuntimeEventData({
        buildId: build.id,
        projectId: projectId,
        type: "build.started",
      }),
    });
    const viteStartedAt = Date.now();
    const buildResult = await buildGeneratedProject(sourceFiles, {
      workspaceKey: projectId,
    });
    viteMs = Date.now() - viteStartedAt;
    devLog("generate", "build.finished", {
      ok: buildResult.ok,
      projectId: projectId,
    });

    let finalBuildResult = buildResult;

    if (!buildResult.ok && !sourceGeneration.energyExhausted) {
      for (let repairAttempt = 0; repairAttempt < 2; repairAttempt++) {
        const renewed = await renewProjectOperation({
          projectId,
          token: operationToken,
          userId,
        });
        if (!renewed) {
          throw new Error("Build operation lease was superseded.");
        }

        send("progress", {
          label: "AI memperbaiki kode",
          detail: `Perbaikan ${repairAttempt + 1}/2. Memperbaiki error build.`,
        });

        try {
          const repairPhaseStartedAt = Date.now();
          const repair = await repairGeneratedProjectFiles({
            buildLog: finalBuildResult.log,
            files: sourceFiles,
            implementationSpec,
            onOperation(operation) {
              send("operation", operation);
            },
            projectId: projectId,
            schema: finalSchema,
            stepCharger: sourceStepCharger,
          });
          sourceFiles = repair.files;

          await prisma.projectSnapshot.update({
            where: { id: snapshot.id },
            data: {
              files: sourceFiles,
              metadata: createGeneratedSourceSnapshotMetadata(
                sourceFiles,
                finalSchema,
                repair,
              ),
            },
          });
          await writeProjectSourceArtifact({
            artifactId: snapshot.id,
            files: sourceFiles,
          });

          const retryBuild = await buildGeneratedProject(sourceFiles, {
            workspaceKey: projectId,
          });
          repairMs += Date.now() - repairPhaseStartedAt;
          repairAttemptsUsed = repairAttempt + 1;
          finalBuildResult = retryBuild;
          devLog("generate", "build.retry.finished", {
            attempt: repairAttempt + 1,
            ok: retryBuild.ok,
            projectId: projectId,
          });

          if (retryBuild.ok) {
            send("progress", {
              label: "Build website berhasil",
              detail: `Berhasil divalidasi setelah ${repairAttempt + 1} perbaikan.`,
            });
            await prisma.projectBuild.update({
              where: { id: build.id },
              data: {
                finishedAt: new Date(),
                logText: retryBuild.log,
                status: "succeeded" satisfies ProjectBuildStatus,
              },
            });
            runtimeBuildFinalized = true;
            break;
          }

          if (repairAttempt === 1) {
            send("progress", {
              label: "Build website gagal",
              detail: "File disimpan. Silakan cek log di tab Kode.",
            });
          }
        } catch (repairError) {
          devLog("generate", "build.repair.error", {
            attempt: repairAttempt + 1,
            error:
              repairError instanceof Error ? repairError.message : "unknown",
            projectId: projectId,
          });
        }
      }
    }

    const finalBuildOk = finalBuildResult.ok;
    devLog("generate", "timings", {
      projectId,
      specMs,
      agentMs,
      viteMs,
      repairMs,
      repairAttempts: repairAttemptsUsed,
      totalMs: Date.now() - generateStartedAt,
      ok: finalBuildOk,
    });

    if (finalBuildOk) {
      send("progress", {
        label: "Build website berhasil",
        detail: "File website berhasil divalidasi.",
      });
    } else if (!sourceGeneration.energyExhausted) {
      // ponytail: on energy exhaustion the energy_exhausted event at :836
      // is the user-facing truth; skip the contradicting "gagal" progress.
      send("progress", {
        label: "Build website gagal",
        detail: "File disimpan. Silakan cek log di tab Kode.",
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
      await prisma.runtimeEvent
        .create({
          data: createRuntimeEventData({
            buildId: build.id,
            message: "Build was canceled after the user stopped the job.",
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
    const artifactRef = finalBuildResult.ok
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
              : "Generated build failed.",
            finishedAt: new Date(),
            status: finalBuildResult.ok ? "succeeded" : "failed",
          },
        });

        return committedDeployment;
      },
      { timeout: 30_000 },
    );
    runtimeBuildFinalized = true;

    // Charge whether build ok or not — AI tokens already spent.
    await flushGenerateEnergy();

    await Promise.allSettled([
      prisma.runtimeEvent.create({
        data: createRuntimeEventData({
          buildId: build.id,
          message: finalBuildResult.ok
            ? "Generated frontend build succeeded and dist artifact was stored."
            : "Generated frontend build failed.",
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
        // tab shows polished code. Fire-and-forget; never fails the turn.
        ...(sourceDir ? [formatGeneratedSource(sourceDir)] : []),
      ]);
    }

    if (!finalBuildOk && !sourceGeneration.energyExhausted) {
      // ponytail: when energy halted the build, the energy_exhausted event
      // already told the user; don't emit a contradicting failure error.
      send("error", {
        message:
          "Build website belum berhasil. Coba build ulang setelah cek brief.",
      });
      return;
    }

    if (!finalBuildOk) {
      return;
    }

    send("progress", {
      label: "Website siap dicek",
      detail: "Website siap ditinjau.",
    });
    devLog("generate", "done", { projectId: projectId });
    send("done", { finalSchema });
  } catch (error) {
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
        ? "AI belum menulis file website."
        : "AI belum bisa membangun website ini.",
      // Never surface raw exception text to the end user (may contain
      // internal paths/stack fragments). The raw message is already
      // preserved in devLog + the ProjectBuild logText for operators.
      detail: emptyAgent
        ? "Agent tidak menulis source. Klik build ulang — biasanya berhasil di percobaan berikutnya."
        : "Coba ulangi atau perbaiki deskripsi usahanya dulu.",
    });
  } finally {
    // Always debit if AI already ran (success or failure).
    await flushGenerateEnergy();
  }
}
