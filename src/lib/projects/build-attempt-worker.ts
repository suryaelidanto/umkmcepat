import { generateText } from "ai";

import type { ImplementationSpec } from "@/lib/projects/implementation-spec";

import {
  getAiModel,
  getAiTelemetry,
  getNoReasoningCallOptions,
} from "@/lib/ai/ai";
import {
  classifyAiError,
  recordAiCall,
  startAiCallTimer,
} from "@/lib/ai/ai-call-record";
import { getGenerationModel } from "@/lib/ai/ai-models";
import { getAiTimeoutMs } from "@/lib/ai/ai-timeouts";
import { getSettingSync } from "@/lib/config/app-settings";
import { devLog } from "@/lib/dev-log";
import { chargeEnergyForAiUsage } from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";
import { runAgenticGenerate } from "@/lib/projects/agentic-generator";
import { briefToBuildPrompt, parseProjectBrief } from "@/lib/projects/brief";
import {
  publishBuildProgress,
  type BuildProgressEvent,
} from "@/lib/projects/build-attempt-pubsub";
import { loadAcceptedHandoffForAttempt } from "@/lib/projects/build-handoffs";
import {
  classifyBuildFailure,
  getIndonesianBuildFailureSummary,
} from "@/lib/projects/build-logs";
import { createStepCharger } from "@/lib/projects/energy-step-charger";
import { formatGeneratedSource } from "@/lib/projects/format-generated-source";
import {
  storeGateEvidence,
  storeGateScreenshotEvidence,
} from "@/lib/projects/gate-evidence";
import { runGeneratedSiteBrowserGates } from "@/lib/projects/generated-site-browser-runner";
import { compileGeneratedSiteContract } from "@/lib/projects/generated-site-contract";
import { selectGeneratedSiteRecipe } from "@/lib/projects/generated-site-recipes";
import {
  buildGeneratedProject,
  createGeneratedSourceSnapshotMetadata,
  createGeneratedViteTanStackStarterFiles,
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
import { runOutcomeCreativeDirection } from "@/lib/projects/outcome-creative-direction";
import { compileOutcomeDirectedSiteContract } from "@/lib/projects/outcome-site-contract";
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
import { projectSiteGenerationSystemPrompt } from "@/lib/projects/site-generation";
import {
  createProjectSiteSchemaFromBrief,
  createProjectSiteSchemaFromGeneratedContract,
} from "@/lib/projects/site-schema";

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
        label: "Menyiapkan website",
        detail: "Membuat website dari brief yang sudah siap.",
      });
    }

    if (effectiveMode === "retry_build") {
      send("progress", {
        label: "Memuat website tersimpan",
        detail: "Menyiapkan pembuatan ulang dari bagian yang sudah ada.",
      });

      const [retryBriefRow] = await prisma.$queryRaw<[{ brief: unknown }]>`
      SELECT "brief" FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId}
    `;
      const retryBrief = parseProjectBrief(retryBriefRow?.brief, projectPrompt);
      const retrySchema = createProjectSiteSchemaFromBrief(retryBrief);

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

      const finalBuildResult = await buildGeneratedProject(sourceFiles, {
        workspaceKey: projectId,
      });

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
          message: "Website siap dilihat.",
          projectId,
        });
        void refreshProjectThumbnail({
          artifactRef: distRef ?? snapshot.id,
          buildId: runtimeBuildId ?? snapshot.id,
          projectId,
        }).catch(() => undefined);
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

      await flushGenerateEnergy();
      return;
    }

    send("progress", {
      label: "Menyiapkan website",
      detail: "Membaca kebutuhan utama dari brief.",
    });

    const generateStartedAt = Date.now();
    let specMs = 0;
    let agentMs = 0;
    let viteMs = 0;

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
        const abortController = new AbortController();
        const timeoutMs = getAiTimeoutMs("buildSpec");
        const timeout = setTimeout(() => abortController.abort(), timeoutMs);
        specAttempts += 1;
        const thisAttempt = specAttempts;
        const stopSpecTimer = startAiCallTimer({ withTtft: true });
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

        // Non-streaming generateText: ttftMs = requestMs (buffered response).
        const specTiming = stopSpecTimer({ nonStreaming: true });
        recordAiCall({
          attemptId,
          buildId: runtimeBuildId ?? undefined,
          inputTokens: result.usage?.inputTokens ?? undefined,
          modelRequested: specRequestedModel,
          modelServed: result.response?.modelId,
          outputTokens: result.usage?.outputTokens ?? undefined,
          projectId,
          requestMs: specTiming.requestMs,
          retryCount: thisAttempt - 1,
          status: "ok",
          task: "build-spec",
          ttftMs: specTiming.ttftMs,
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
        label: "Menyusun halaman lagi",
        detail: "Merapikan struktur halaman.",
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
        label: "Menyiapkan rancangan website",
        detail:
          "Rancangan awal belum lengkap, jadi kami melanjutkan dari brief.",
      });
      send("progress", {
        label: "Membuat halaman utama",
        detail: "Menyusun halaman utama dari data usaha.",
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

    const acceptedHandoff = await loadAcceptedHandoffForAttempt({
      attemptId,
      projectId,
      userId,
    });
    const useGeneratedSiteQuality =
      acceptedHandoff !== null &&
      (acceptedHandoff.plan.appKind === "landing" ||
        acceptedHandoff.plan.appKind === "marketing_site");

    let implementationSpec: ImplementationSpec | undefined;
    let finalSchema = createProjectSiteSchemaFromBrief(brief);
    let generatedSiteContract: ReturnType<
      typeof compileGeneratedSiteContract
    > | null = null;

    if (useGeneratedSiteQuality && acceptedHandoff) {
      const generatedSiteRecipe = selectGeneratedSiteRecipe(
        acceptedHandoff.plan.archetype,
      );
      generatedSiteContract = compileGeneratedSiteContract({
        contract: acceptedHandoff.contract,
        plan: acceptedHandoff.plan,
        briefSnapshot: acceptedHandoff.briefSnapshot,
        photoEnabled: Boolean(
          getSettingSync("feature.composer_uploads_enabled", true),
        ),
        recipe: generatedSiteRecipe,
      });
      const briefSchema = createProjectSiteSchemaFromBrief(brief);
      finalSchema = createProjectSiteSchemaFromGeneratedContract({
        contract: generatedSiteContract,
        theme: finalSchema.theme,
      });
      if (!finalSchema.images?.length && briefSchema.images?.length) {
        finalSchema.images = briefSchema.images;
      }
      if (briefSchema.primaryCtaTarget) {
        finalSchema.primaryCtaTarget = briefSchema.primaryCtaTarget;
      }
    } else {
      const implementationSpecPrompt = buildImplementationSpecPrompt(brief);
      const specStartedAt = Date.now();
      const specResult = await generateImplementationSpec(
        implementationSpecPrompt,
      );
      specMs = Date.now() - specStartedAt;
      implementationSpec = specResult.spec;
      specInputTokens = specResult.inputTokens;
      specOutputTokens = specResult.outputTokens;
      specModelId = specResult.modelId;
      finalSchema = implementationSpecToSiteSchema(implementationSpec);
    }

    const currentProjectAssets = prisma.projectAsset?.findMany
      ? await prisma.projectAsset.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          select: { id: true, purpose: true },
        })
      : [];

    if (currentProjectAssets.length > 0) {
      finalSchema.images = currentProjectAssets.map((asset) => ({
        url: `/api/media/${asset.id}`,
        purpose: asset.purpose || "business-image",
        alt: finalSchema.businessName,
      }));
    } else {
      finalSchema.images = [];
    }

    const specLeaseRenewed = await renewProjectOperation({
      projectId,
      token: operationToken,
      userId,
    });

    if (!specLeaseRenewed) {
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

    const outcomeDirection = acceptedHandoff
      ? await runOutcomeCreativeDirection({
          abortSignal,
          contract: compileOutcomeDirectedSiteContract({
            briefHash: acceptedHandoff.briefHash,
            briefRevision: acceptedHandoff.briefRevision,
            briefSnapshot: acceptedHandoff.briefSnapshot,
            contract: acceptedHandoff.contract,
            contractHash: acceptedHandoff.contractHash,
            contractRevision: acceptedHandoff.contractRevision,
            id: acceptedHandoff.id,
            plan: acceptedHandoff.plan,
            planHash: acceptedHandoff.planHash,
            planRevision: acceptedHandoff.planRevision,
          }),
          projectId,
          userId,
        })
      : null;

    const agentStartedAt = Date.now();
    send("progress", {
      label: "Menyiapkan pembuatan website",
      detail: "AI sedang merancang arsitektur dan komponen website.",
    });

    const existingSourceFiles = await loadPersistedProjectSourceFiles({
      projectId,
      userId,
    }).catch(() => []);

    const agenticResult = await runAgenticGenerate({
      abortSignal,
      attemptId,
      brief,
      buildId: runtimeBuildId,
      creativeDirection: outcomeDirection
        ? JSON.stringify(outcomeDirection)
        : (acceptedHandoff?.creativeDirection ?? null),
      initialFiles:
        existingSourceFiles.length > 0 ? existingSourceFiles : undefined,
      onEvent: (type, data) => send(type, data),
      onFileStaged: persistBatchedStage,
      operationToken,
      projectId,
      schema: finalSchema,
      stepCharger: sourceStepCharger,
      userId,
    });

    const generationOutput = {
      buildSpec: buildPrompt,
      energyExhausted: sourceStepCharger.isExhausted(),
      files: agenticResult.files,
      generationMode: "agentic" as const,
      operationTrace: agenticResult.operationTrace,
      repairAttempts: 0,
      summary: agenticResult.summary,
      touchedFiles: agenticResult.touchedFiles,
      referenceCalibratedQualityProof: undefined,
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
      buildSpecLength: sourceGeneration.buildSpec.length,
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
    if (sourceGeneration.repairAttempts > 0) {
      send("operation", {
        detail: `${sourceGeneration.repairAttempts} bagian website dirapikan.`,
        id: `repair-${sourceGeneration.repairAttempts}`,
        state: "succeeded",
        title: "Merapikan tampilan",
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
    const viteStartedAt = Date.now();
    const buildResult = await buildGeneratedProject(sourceFiles, {
      workspaceKey: projectId,
    });
    viteMs = Date.now() - viteStartedAt;
    devLog("generate", "build.finished", {
      ok: buildResult.ok,
      projectId: projectId,
    });

    if (buildResult.ok) {
      // Capture screenshot thumbnails for history and preview
      try {
        if (generatedSiteContract) {
          await runGeneratedSiteBrowserGates(
            {
              projectId,
              candidateId: snapshot.id,
              files: buildResult.distFiles,
              contract: generatedSiteContract,
              timeoutMs: 10_000,
            },
            {
              storeEvidence: async (evidence) => {
                const refs = [
                  await storeGateEvidence({
                    projectId: evidence.projectId,
                    candidateId: evidence.candidateId,
                    kind: "report",
                    route: evidence.route,
                    viewport: evidence.viewport,
                    value: evidence.value,
                  }),
                ];
                if (evidence.screenshot) {
                  refs.push(
                    await storeGateScreenshotEvidence({
                      projectId: evidence.projectId,
                      candidateId: evidence.candidateId,
                      route: evidence.route,
                      viewport: evidence.viewport,
                      bytes: evidence.screenshot,
                    }),
                  );
                }
                return refs;
              },
            },
          ).catch(() => null);
        }
      } catch {
        // Thumbnail capture is non-blocking
      }
    }

    const finalBuildResult = buildResult;

    const finalBuildOk = finalBuildResult.ok;
    devLog("generate", "timings", {
      projectId,
      specMs,
      agentMs,
      viteMs,
      totalMs: Date.now() - generateStartedAt,
      ok: finalBuildOk,
    });

    if (finalBuildOk) {
      send("progress", {
        label: "Website sudah diperiksa",
        detail: "Semua bagian website berhasil diperiksa.",
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

    // Charge whether build ok or not — AI tokens already spent.
    await flushGenerateEnergy();

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
        ? "Website belum selesai dibuat."
        : "Website belum berhasil dibuat.",
      // Never surface raw exception text to the end user (may contain
      detail: emptyAgent
        ? "Belum ada bagian website yang berhasil ditulis. Coba buat ulang website — biasanya berhasil di percobaan berikutnya."
        : "Coba buat ulang website.",
    });
  } finally {
    // Always debit if AI already ran (success or failure).
    await flushGenerateEnergy();
  }
}
