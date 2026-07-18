import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getGenerationModel } from "@/lib/ai-models";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import { auth } from "@/lib/auth";
import { isGeneratedBuildExecutionEnabled } from "@/lib/config";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import {
  BRIEF_CONFIDENCE_THRESHOLD,
  briefToBuildPrompt,
  isBriefReady,
  parseProjectBrief,
} from "@/lib/projects/brief";
import {
  generateCustomProjectFilesWithAgent,
  repairGeneratedProjectFiles,
} from "@/lib/projects/custom-source-generator";
import {
  buildGeneratedProject,
  createGeneratedSourceSnapshotMetadata,
} from "@/lib/projects/generated-source";
import {
  buildImplementationSpecPrompt,
  implementationSpecFromBrief,
  implementationSpecTool,
  implementationSpecToSiteSchema,
  parseImplementationSpec,
} from "@/lib/projects/implementation-spec";
import {
  claimProjectOperation,
  finalizeProjectOperation,
  renewProjectOperation,
} from "@/lib/projects/project-operation";
import { refreshProjectThumbnail } from "@/lib/projects/project-thumbnail";
import { resolveProjectSourceFiles } from "@/lib/projects/resolve-project-source-files";
import {
  readProjectSourceArtifact,
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
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  chargeEnergyForAiUsage,
  checkEnergy,
  isUserVerified,
  MIN_ENERGY_BUILD,
} from "@/lib/user-credits";

const GENERATED_SNAPSHOT_SOURCE_TYPE =
  "generated" satisfies ProjectSnapshotSourceType;
const PREVIEW_DEPLOYMENT_KIND = "preview" satisfies ProjectDeploymentKind;

function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const Route = createFileRoute("/api/projects/$id/generate")({
  server: {
    handlers: {
      POST: ({ request, params }) => handleGeneratePost(request, params.id),
    },
  },
});

async function handleGeneratePost(request: Request, routeId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { message: "Masuk dulu untuk melanjutkan." },
      { status: 401 },
    );
  }

  let generateMode: "first_generate" | "retry_build" = "first_generate";
  try {
    const body = (await request.json()) as { mode?: string };
    if (body?.mode === "retry_build") {
      generateMode = "retry_build";
    }
  } catch {
    // empty body = first generate
  }

  const userId = session.user.id;

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

  const energy = await checkEnergy(userId, MIN_ENERGY_BUILD);
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
    select: { buildStatus: true, id: true, prompt: true, status: true },
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

  const [briefGateRow] = await prisma.$queryRaw<[{ brief: unknown }]>`
    SELECT "brief" FROM "Project" WHERE id = ${project.id} AND "userId" = ${userId}
  `;
  const gateBrief = parseProjectBrief(briefGateRow?.brief, project.prompt);

  if (!isBriefReady(gateBrief)) {
    return Response.json(
      {
        code: "brief_confidence_too_low",
        confidence: gateBrief.confidence,
        message: `AI belum yakin ${BRIEF_CONFIDENCE_THRESHOLD}% bahwa kebutuhanmu sudah jelas. Lanjut diskusi dulu.`,
        openQuestions: gateBrief.openQuestions,
      },
      { status: 409 },
    );
  }

  await markStaleProjectBuilds(project.id);

  const latestProjectState = await prisma.project.findFirst({
    where: { id: project.id, userId },
    select: { buildStatus: true, status: true },
  });

  if (
    latestProjectState?.status === "building" ||
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

  const projectId = project.id;
  const projectPrompt = project.prompt;

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
        startedAt: new Date(),
        status: "running" satisfies ProjectBuildStatus,
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let runtimeBuildFinalized = false;
      let runtimeBuildId: string | null = earlyBuildId;
      let lastPersistedProgressLabel: string | null = null;

      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(encodeEvent(event, data)));

        if (
          event === "progress" &&
          data &&
          typeof data === "object" &&
          "label" in data
        ) {
          const label = String(
            (data as { label?: unknown }).label ?? "",
          ).trim();
          const detail = String(
            (data as { detail?: unknown }).detail ?? label,
          ).trim();
          if (label && label !== lastPersistedProgressLabel) {
            lastPersistedProgressLabel = label;
            void prisma.runtimeEvent
              .create({
                data: createRuntimeEventData({
                  buildId: runtimeBuildId,
                  message: label,
                  metadata: { detail, label },
                  projectId,
                  type: "build.progress",
                }),
              })
              .catch(() => undefined);
          }
        }
      }

      let specInputTokens = 0;
      let specOutputTokens = 0;
      let specModelId: string | undefined;
      let sourceInputTokens = 0;
      let sourceOutputTokens = 0;
      let sourceModelId: string | undefined;
      let energyCharged = false;

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
        if (sourceInputTokens > 0 || sourceOutputTokens > 0) {
          await chargeEnergyForAiUsage({
            userId,
            modelId: sourceModelId || fallbackModelId,
            inputTokens: sourceInputTokens,
            outputTokens: sourceOutputTokens,
            reason: "build:source",
          });
        }
      };

      try {
        if (generateMode === "retry_build") {
          send("progress", {
            label: "Memuat source tersimpan",
            detail:
              "Membangun ulang dari file yang sudah ada (bukan generate dari awal).",
          });

          const [sourceRow] = await prisma.$queryRaw<
            [{ sourceFiles: unknown }]
          >`
            SELECT "sourceFiles" FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId}
          `;
          const latestAttempt = await prisma.projectBuild.findFirst({
            where: { projectId },
            orderBy: { createdAt: "desc" },
            select: {
              snapshot: {
                select: {
                  files: true,
                  id: true,
                  sourceRef: true,
                },
              },
            },
          });
          const latestProjectSnapshot = await prisma.projectSnapshot.findFirst({
            where: { projectId },
            orderBy: { createdAt: "desc" },
            select: {
              files: true,
              id: true,
              sourceRef: true,
            },
          });
          let sourceFiles = await resolveProjectSourceFiles({
            latestAttemptSnapshot: latestAttempt?.snapshot ?? null,
            latestProjectSnapshot,
            projectSourceFiles: sourceRow?.sourceFiles,
            readArtifact: (sourceRef) => readProjectSourceArtifact(sourceRef),
          });

          if (!sourceFiles.length) {
            throw new Error(
              "Belum ada source tersimpan. Jalankan build pertama dulu.",
            );
          }

          send("progress", {
            label: "Build website dari source tersimpan",
            detail: `${sourceFiles.length} file dimuat. Menjalankan validasi build.`,
          });

          const [retryBriefRow] = await prisma.$queryRaw<[{ brief: unknown }]>`
            SELECT "brief" FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId}
          `;
          const retryBrief = parseProjectBrief(
            retryBriefRow?.brief,
            projectPrompt,
          );
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

          let finalBuildResult = await buildGeneratedProject(sourceFiles);

          if (!finalBuildResult.ok) {
            for (let repairAttempt = 0; repairAttempt < 2; repairAttempt++) {
              const renewed = await renewProjectOperation({
                projectId,
                token: operation.token,
                userId,
              });
              if (!renewed) {
                throw new Error("Build operation lease was superseded.");
              }
              send("progress", {
                label: "AI memperbaiki kode",
                detail: `Percobaan perbaikan ${repairAttempt + 1} dari 2. AI sedang membenarkan error build.`,
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
                });
                sourceInputTokens += repair.usage?.inputTokens ?? 0;
                sourceOutputTokens += repair.usage?.outputTokens ?? 0;
                if (repair.modelId) {
                  sourceModelId = repair.modelId;
                }
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
                finalBuildResult = await buildGeneratedProject(sourceFiles);
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

          await prisma.project.update({
            where: { id: projectId },
            data: {
              buildLog: finalBuildResult.log ?? "",
              buildStatus: buildOk ? "ready" : "failed",
              sourceFiles: sourceFiles as object,
              status: buildOk ? "ready" : "failed",
            },
          });

          if (runtimeBuildId) {
            await prisma.projectBuild.update({
              where: { id: runtimeBuildId },
              data: {
                finishedAt: new Date(),
                logText: finalBuildResult.log ?? "",
                status: buildOk ? "succeeded" : "failed",
                ...(distRef ? { artifactRef: distRef } : {}),
              },
            });
            runtimeBuildFinalized = true;
          }

          if (buildOk) {
            await prisma.projectDeployment
              .create({
                data: {
                  buildId: runtimeBuildId,
                  kind: PREVIEW_DEPLOYMENT_KIND,
                  projectId,
                  snapshotId: snapshot.id,
                  status: "running" satisfies ProjectDeploymentStatus,
                },
              })
              .catch(() => undefined);
            send("done", {
              message: "Build ulang berhasil.",
              projectId,
            });
            void refreshProjectThumbnail({
              artifactRef: distRef ?? snapshot.id,
              buildId: runtimeBuildId ?? snapshot.id,
              projectId,
            }).catch(() => undefined);
          } else {
            send("progress", {
              label: "Build website gagal",
              detail:
                "File website tetap disimpan, tapi build log perlu dicek di tab Kode.",
            });
            send("error", {
              message: "AI belum bisa membangun website ini.",
              detail: finalBuildResult.log?.slice(0, 500) || "Build gagal.",
            });
          }

          await finalizeProjectOperation({
            data: {
              buildStatus: buildOk ? "ready" : "failed",
              status: buildOk ? "ready" : "failed",
            },
            projectId,
            token: operation.token,
            userId,
          }).catch(() => false);
          await flushGenerateEnergy();
          controller.close();
          return;
        }

        send("progress", {
          label: "Memahami usaha dan target pembeli",
          detail: "AI membaca kebutuhan utama dari brief kamu.",
        });

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
            const timeout = setTimeout(
              () => abortController.abort(),
              timeoutMs,
            );

            let result;
            try {
              result = await generateText({
                model: getAiModel(getGenerationModel()),
                maxOutputTokens: maxTokens,
                temperature: 0.35,
                abortSignal: abortController.signal,
                instructions: system,
                prompt,
                tools: {
                  presentImplementationSpec: implementationSpecTool,
                },
                toolChoice: {
                  type: "tool",
                  toolName: "presentImplementationSpec",
                },
                telemetry: getAiTelemetry("project-implementation-spec", {
                  projectId,
                  route: "api.projects.generate",
                  userId,
                }),
              });
            } finally {
              clearTimeout(timeout);
            }

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
            detail: "Rancangan perlu waktu lebih untuk diselesaikan.",
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
            detail:
              "Sudah dicoba 2 kali. Lanjut pakai rancangan dari brief diskusi yang sudah disetujui.",
          });
          send("progress", {
            label: "Pakai rancangan dari brief",
            detail:
              "Struktur default landing + data usaha dari diskusi. Website tetap dibangun.",
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
        const specResult = await generateImplementationSpec(
          implementationSpecPrompt,
        );
        const implementationSpec = specResult.spec;
        specInputTokens = specResult.inputTokens;
        specOutputTokens = specResult.outputTokens;
        specModelId = specResult.modelId;
        const specLeaseRenewed = await renewProjectOperation({
          projectId,
          token: operation.token,
          userId,
        });

        if (!specLeaseRenewed) {
          throw new Error("Build operation lease was superseded.");
        }

        const finalSchema = implementationSpecToSiteSchema(implementationSpec);
        send("progress", {
          label: "Menyiapkan starter React",
          detail: "Vite React TypeScript dan TanStack Router disiapkan.",
        });
        const sourceGeneration = await generateCustomProjectFilesWithAgent({
          implementationBrief: buildPrompt,
          implementationSpec,
          onOperation(operation) {
            send("operation", operation);
          },
          projectId: projectId,
          schema: finalSchema,
        });
        sourceInputTokens = sourceGeneration.usage?.inputTokens ?? 0;
        sourceOutputTokens = sourceGeneration.usage?.outputTokens ?? 0;
        sourceModelId = sourceGeneration.modelId;
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
          token: operation.token,
          userId,
        });

        if (!sourceLeaseRenewed) {
          throw new Error("Build operation lease was superseded.");
        }

        send("progress", {
          label: "AI menulis file website",
          detail: `${sourceGeneration.touchedFiles.length} file dibuat atau diubah agent.`,
        });
        if (sourceGeneration.repairAttempts > 0) {
          send("operation", {
            detail: `${sourceGeneration.repairAttempts} percobaan perbaikan build dilakukan.`,
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
          where: { id: operationAttemptId },
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
            detail:
              "Agent berhenti lebih awal (timeout, dibatasi, atau terputus). Mencoba build dengan file yang ada.",
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
          where: { id: operationAttemptId },
          data: { buildId: build.id, snapshotId: snapshot.id },
        });
        send("progress", {
          label: "Build masuk antrean",
          detail: "Worker build menyiapkan validasi file website.",
        });
        await prisma.runtimeEvent.create({
          data: createRuntimeEventData({
            buildId: build.id,
            projectId: projectId,
            type: "build.started",
          }),
        });
        const buildResult = await buildGeneratedProject(sourceFiles);
        devLog("generate", "build.finished", {
          ok: buildResult.ok,
          projectId: projectId,
        });

        let finalBuildResult = buildResult;

        if (!buildResult.ok) {
          for (let repairAttempt = 0; repairAttempt < 2; repairAttempt++) {
            const renewed = await renewProjectOperation({
              projectId,
              token: operation.token,
              userId,
            });
            if (!renewed) {
              throw new Error("Build operation lease was superseded.");
            }

            send("progress", {
              label: "AI memperbaiki kode",
              detail: `Percobaan perbaikan ${repairAttempt + 1} dari 2. AI sedang membenarkan error build.`,
            });

            try {
              const repair = await repairGeneratedProjectFiles({
                buildLog: finalBuildResult.log,
                files: sourceFiles,
                implementationSpec,
                onOperation(operation) {
                  send("operation", operation);
                },
                projectId: projectId,
                schema: finalSchema,
              });
              sourceInputTokens += repair.usage?.inputTokens ?? 0;
              sourceOutputTokens += repair.usage?.outputTokens ?? 0;
              if (repair.modelId) {
                sourceModelId = repair.modelId;
              }
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

              const retryBuild = await buildGeneratedProject(sourceFiles);
              finalBuildResult = retryBuild;
              devLog("generate", "build.retry.finished", {
                attempt: repairAttempt + 1,
                ok: retryBuild.ok,
                projectId: projectId,
              });

              if (retryBuild.ok) {
                send("progress", {
                  label: "Build website berhasil",
                  detail: `File website berhasil divalidasi setelah ${repairAttempt + 1} perbaikan.`,
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
                  detail:
                    "File website tetap disimpan, tapi build log perlu dicek di tab Kode.",
                });
              }
            } catch (repairError) {
              devLog("generate", "build.repair.error", {
                attempt: repairAttempt + 1,
                error:
                  repairError instanceof Error
                    ? repairError.message
                    : "unknown",
                projectId: projectId,
              });
            }
          }
        }

        const finalBuildOk = finalBuildResult.ok;

        if (finalBuildOk) {
          send("progress", {
            label: "Build website berhasil",
            detail: "File website berhasil divalidasi.",
          });
        } else {
          send("progress", {
            label: "Build website gagal",
            detail:
              "File website tetap disimpan, tapi build log perlu dicek di tab Kode.",
          });
        }
        const latestProject = await prisma.project.findUnique({
          where: { id: projectId },
          select: { status: true },
        });

        if (latestProject?.status === "stopping") {
          await prisma.$transaction(async (transaction) => {
            const finalized = await finalizeProjectOperation({
              data: { buildStatus: "stopped", status: "draft" },
              projectId,
              store: transaction,
              token: operation.token,
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
              where: { id: operationAttemptId },
              data: { finishedAt: new Date(), status: "canceled" },
            });
          });
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
        const deployment = await prisma.$transaction(async (transaction) => {
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
            token: operation.token,
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
          const committedDeployment =
            await transaction.projectDeployment.create({
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
            where: { id: operationAttemptId },
            data: {
              errorMessage: finalBuildResult.ok
                ? null
                : "Generated build failed.",
              finishedAt: new Date(),
              status: finalBuildResult.ok ? "succeeded" : "failed",
            },
          });

          return committedDeployment;
        });
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
          ]);
        }

        if (!finalBuildOk) {
          send("error", {
            message:
              "Build website belum berhasil. Coba build ulang setelah cek brief.",
          });
          return;
        }

        send("progress", {
          label: "Website siap dicek",
          detail: "Tampilan dan file website sudah siap dicek.",
        });
        devLog("generate", "done", { projectId: projectId });
        send("done", finalSchema);
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
            token: operation.token,
            userId,
          }),
          prisma.projectEditAttempt.updateMany({
            where: {
              finishedAt: null,
              id: operationAttemptId,
              status: { in: ["generating", "building"] },
            },
            data: {
              errorMessage: logText,
              finishedAt: new Date(),
              status: "failed",
            },
          }),
        ]);
        send("error", {
          message: "AI belum bisa membangun website ini.",
          detail: rawErrorMessage,
        });
      } finally {
        // Always debit if AI already ran (success or failure).
        await flushGenerateEnergy();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
