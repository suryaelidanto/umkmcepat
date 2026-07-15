import { randomUUID } from "node:crypto";

import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getGenerationModel } from "@/lib/ai-models";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import { auth } from "@/lib/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import { isGeneratedBuildExecutionEnabled } from "@/lib/config";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import {
  BRIEF_CONFIDENCE_THRESHOLD,
  briefToBuildPrompt,
  canBriefBuild,
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
  implementationSpecToSiteSchema,
  parseImplementationSpec,
  type ImplementationSpec,
} from "@/lib/projects/implementation-spec";
import {
  claimProjectOperation,
  finalizeProjectOperation,
  renewProjectOperation,
} from "@/lib/projects/project-operation";
import { refreshProjectThumbnail } from "@/lib/projects/project-thumbnail";
import {
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
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  addEnergyUsage,
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

type GenerateRequestBody = { force?: boolean };

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

  let body: GenerateRequestBody;

  try {
    body = (await readBoundedJson(request, {
      maxBytes: 16 * 1024,
    })) as GenerateRequestBody;
  } catch (error) {
    if (isBoundedJsonError(error)) {
      return Response.json(
        {
          code: error.code,
          message:
            error.code === "request_body_too_large"
              ? "Permintaan build terlalu besar."
              : "Format permintaan build belum valid.",
        },
        { status: error.code === "request_body_too_large" ? 413 : 400 },
      );
    }

    throw error;
  }

  const forceBuild = body.force === true;
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

  if (!forceBuild && !canBriefBuild(gateBrief)) {
    return Response.json(
      {
        code: "brief_confidence_too_low",
        confidence: gateBrief.confidence,
        message: `AI belum yakin ${BRIEF_CONFIDENCE_THRESHOLD}% bahwa kebutuhanmu sudah jelas. Lanjut diskusi dulu, atau paksa build kalau kamu memang mau.`,
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
      let runtimeBuildId: string | null = null;

      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(encodeEvent(event, data)));
      }

      try {
        send("progress", {
          label: "Memahami usaha dan target pembeli",
          detail: "AI membaca kebutuhan utama dari brief kamu.",
        });

        const [briefRow] = await prisma.$queryRaw<[{ brief: unknown }]>`
          SELECT "brief" FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId}
        `;
        const brief = forceBuild
          ? {
              ...parseProjectBrief(briefRow?.brief, projectPrompt),
              forcedBuild: {
                assumed: ["Build dipaksa sebelum AI mencapai keyakinan 95%."],
              },
            }
          : parseProjectBrief(briefRow?.brief, projectPrompt);
        devLog("generate", "brief.parsed", {
          projectId,
          promptLength: projectPrompt.length,
        });
        const buildPrompt = briefToBuildPrompt(brief);

        async function generateImplementationSpec(prompt: string) {
          const result = streamText({
            model: getAiModel(getGenerationModel()),
            maxOutputTokens: 8192,
            temperature: 0.35,
            timeout: getAiTimeoutMs("buildSpec"),
            system:
              projectSiteGenerationSystemPrompt +
              "\n\nOutput a JSON object with exactly these fields:\n" +
              '- appKind: "landing" | "marketing_site" | "interactive_app"\n' +
              "- businessName: string\n" +
              "- pages: array of {slug: string, title: string, purpose: string} (1-6 items)\n" +
              "- components: array of {name: string, purpose: string} (2-10 items)\n" +
              "- features: array of strings (1-10 items)\n" +
              "- content: object\n" +
              '- style: {direction: string, palette: {background: "#hex", foreground: "#hex", muted: "#hex", accent: "#hex"}}\n' +
              "- primaryCta: string\n" +
              "- notes: array of strings\n\n" +
              "Output valid JSON only. No markdown fences, no explanation.",
            prompt,
            experimental_telemetry: getAiTelemetry(
              "project-implementation-spec",
              {
                projectId,
                route: "api.projects.generate",
                userId,
              },
            ),
            onError(error) {
              devLog("generate", "spec.error", {
                error: error instanceof Error ? error.message : String(error),
                projectId,
              });
              send("progress", {
                label: "AI mengalami kendala",
                detail:
                  "UMKM Cepat akan memeriksa ulang hasil sebelum build dilanjutkan.",
              });
            },
          });

          let sentKind = false;
          let sentStructure = false;
          let sentDesign = false;
          let accumulated = "";

          for await (const delta of result.textStream) {
            accumulated += delta;
            const spec = parseImplementationSpec(
              parseJsonLenientSafe(accumulated),
            );
            if (!spec) {
              continue;
            }

            if (!sentKind) {
              sentKind = true;
              send("progress", {
                label: "Memilih jenis aplikasi",
                detail: `AI memilih arah ${spec.appKind.replace(/_/g, " ")}.`,
              });
            }

            if (!sentStructure && spec.pages.length) {
              sentStructure = true;
              send("progress", {
                label: "Menyusun struktur",
                detail: `${spec.pages.length} halaman/flow dan ${spec.components.length} komponen dirancang.`,
              });
            }

            if (!sentDesign && spec.style.direction) {
              sentDesign = true;
              send("progress", {
                label: "Memilih arah visual",
                detail: spec.style.direction,
              });
            }

            send("implementation_spec", spec);
            send("schema", implementationSpecToSiteSchema(spec));
          }

          devLog("generate", "spec.accumulated", {
            projectId,
            length: accumulated.length,
            preview: accumulated.slice(0, 200),
          });

          const spec = parseImplementationSpec(
            parseJsonLenientSafe(accumulated),
          );
          if (!spec) {
            devLog("generate", "spec.parse.failed", {
              projectId,
              accumulated: accumulated.slice(0, 500),
            });
            throw new Error(
              "AI implementation spec was invalid after retries.",
            );
          }
          const usage = await result.usage;
          return {
            spec,
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
          };
        }

        const implementationSpecPrompt = buildImplementationSpecPrompt(brief);
        let implementationSpec: ImplementationSpec;
        let specInputTokens = 0;
        let specOutputTokens = 0;
        try {
          const specResult = await generateImplementationSpec(
            implementationSpecPrompt,
          );
          implementationSpec = specResult.spec;
          specInputTokens = specResult.inputTokens;
          specOutputTokens = specResult.outputTokens;
        } catch {
          send("progress", {
            label: "Memeriksa ulang rancangan",
            detail: "AI mencoba sekali lagi sebelum proses build dimulai.",
          });
          // Wait 5s before retry so rate limits have time to clear.
          await new Promise((resolve) => setTimeout(resolve, 5_000));
          const specResult = await generateImplementationSpec(
            implementationSpecPrompt,
          );
          implementationSpec = specResult.spec;
          specInputTokens = specResult.inputTokens;
          specOutputTokens = specResult.outputTokens;
        }
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
        let sourceInputTokens = sourceGeneration.usage?.inputTokens ?? 0;
        let sourceOutputTokens = sourceGeneration.usage?.outputTokens ?? 0;
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

        // If the agent timed out with partial files, persist the snapshot and
        // fail the build honestly — the user can review partial output and retry.
        if (isPartial) {
          send("progress", {
            label: "AI belum selesai menulis file",
            detail:
              "Agent kehabisan waktu. File yang sudah ditulis tetap tersimpan. Kamu bisa coba lagi.",
          });
          await finalizeProjectOperation({
            data: {
              buildStatus: "failed",
              status: "failed",
              sourceFiles,
            },
            projectId,
            token: operation.token,
            userId,
          });
          await prisma.projectEditAttempt.updateMany({
            where: {
              finishedAt: null,
              id: operationAttemptId,
              status: { in: ["generating", "building"] },
            },
            data: {
              errorMessage: "Agent timed out with partial files.",
              finishedAt: new Date(),
              status: "failed",
            },
          });
          send("error", {
            code: "agent_timeout",
            message:
              "AI belum selesai menulis semua file website. File yang sudah ditulis tetap tersimpan. Coba lagi untuk mencoba ulang.",
            partial: true,
          });
          return;
        }

        const build = await prisma.projectBuild.create({
          data: {
            projectId: projectId,
            snapshotId: snapshot.id,
            status: "queued" satisfies ProjectBuildStatus,
          },
          select: { id: true },
        });
        runtimeBuildId = build.id;
        await prisma.projectEditAttempt.update({
          where: { id: operationAttemptId },
          data: { buildId: build.id },
        });
        send("progress", {
          label: "Build masuk antrean",
          detail: "Worker build menyiapkan validasi file website.",
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
              detail: `Percobaan perbaikan ${repairAttempt + 1} dari 2. AI sedang membenarkan error TypeScript.`,
            });

            try {
              const repair = await repairGeneratedProjectFiles({
                buildLog: buildResult.log,
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

        if (finalBuildResult.ok) {
          await addEnergyUsage(
            userId,
            specInputTokens + sourceInputTokens,
            specOutputTokens + sourceOutputTokens,
            "build",
          );
        }

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

        send("progress", {
          label: "Website siap dicek",
          detail: "Tampilan dan file website sudah siap dicek.",
        });
        devLog("generate", "done", { projectId: projectId });
        send("done", finalSchema);
      } catch (error) {
        devLog("generate", "error", {
          error: error instanceof Error ? error.message : String(error),
          projectId: projectId,
        });
        if (runtimeBuildId && !runtimeBuildFinalized) {
          await prisma.projectBuild
            .update({
              where: { id: runtimeBuildId },
              data: {
                finishedAt: new Date(),
                logText: "Build route failed before completion.",
                status: "failed" satisfies ProjectBuildStatus,
              },
            })
            .catch(() => undefined);
          await prisma.runtimeEvent
            .create({
              data: createRuntimeEventData({
                buildId: runtimeBuildId,
                message: "Build route failed before completion.",
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
              errorMessage: "Build failed before completion.",
              finishedAt: new Date(),
              status: "failed",
            },
          }),
        ]);
        send("error", { message: "AI belum bisa membangun website ini." });
      } finally {
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

function parseJsonLenientSafe(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }

    return null;
  }
}
