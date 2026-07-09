import { jsonSchema, Output, streamText } from "ai";

import { getAiModel, getAiTelemetry } from "@/lib/ai";
import { getAiTimeoutMs } from "@/lib/ai-timeouts";
import { auth } from "@/lib/auth";
import { devLog } from "@/lib/dev-log";
import { prisma } from "@/lib/prisma";
import {
  BRIEF_CONFIDENCE_THRESHOLD,
  briefToBuildPrompt,
  canBriefBuild,
  parseProjectBrief,
} from "@/lib/projects/brief";
import { generateCustomProjectFilesWithAgent } from "@/lib/projects/custom-source-generator";
import {
  buildGeneratedProject,
  createGeneratedSourceSnapshotMetadata,
} from "@/lib/projects/generated-source";
import {
  buildImplementationSpecPrompt,
  createFallbackImplementationSpec,
  implementationSpecJsonSchema,
  implementationSpecToSiteSchema,
  parseImplementationSpec,
  type ImplementationSpec,
} from "@/lib/projects/implementation-spec";
import {
  writeProjectDistArtifact,
  writeProjectSourceArtifact,
} from "@/lib/projects/runtime-artifacts";
import { createRuntimeEventData } from "@/lib/projects/runtime-events";
import {
  type ProjectBuildStatus,
  type ProjectDeploymentKind,
  type ProjectDeploymentStatus,
  type ProjectSnapshotSourceType,
} from "@/lib/projects/runtime-types";
import { projectSiteGenerationSystemPrompt } from "@/lib/projects/site-generation";
import { markStaleProjectBuilds } from "@/lib/projects/stale-builds";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 180;

const GENERATED_SNAPSHOT_SOURCE_TYPE =
  "generated" satisfies ProjectSnapshotSourceType;
const PREVIEW_DEPLOYMENT_KIND = "preview" satisfies ProjectDeploymentKind;

type RouteProps = {
  params: Promise<{ id: string }>;
};

function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

type GenerateRequestBody = { force?: boolean };

export async function POST(request: Request, { params }: RouteProps) {
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

  const body = (await request.json().catch(() => ({}))) as GenerateRequestBody;
  const forceBuild = body.force === true;
  const { id } = await params;
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

  const claimedProject = await prisma.project.updateMany({
    where: {
      buildStatus: { not: "running" },
      id: projectId,
      status: { not: "building" },
      userId,
    },
    data: { buildStatus: "running", status: "building" },
  });

  if (claimedProject.count !== 1) {
    return Response.json(
      {
        code: "project_build_in_progress",
        message: "Build masih berjalan untuk proyek ini.",
      },
      { status: 409 },
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
        const fallbackSpec = createFallbackImplementationSpec(brief);

        async function generateImplementationSpec(prompt: string) {
          const result = streamText({
            model: getAiModel(),
            temperature: 0.35,
            timeout: getAiTimeoutMs("buildSpec"),
            output: Output.object({
              name: "ImplementationSpec",
              description:
                "A flexible generated app implementation spec. Decide landing, marketing_site, or interactive_app from the conversation.",
              schema: jsonSchema<ImplementationSpec>(
                implementationSpecJsonSchema,
              ),
            }),
            system: projectSiteGenerationSystemPrompt,
            prompt,
            experimental_telemetry: getAiTelemetry(
              "project-implementation-spec",
              {
                projectId,
                route: "api.projects.generate",
                userId,
              },
            ),
            onError() {
              send("progress", {
                label: "AI mengalami kendala",
                detail:
                  "UMKM Cepat akan memeriksa ulang hasil sebelum build dilanjutkan.",
              });
            },
          });

          let latest: unknown;
          let sentKind = false;
          let sentStructure = false;
          let sentDesign = false;

          for await (const partial of result.partialOutputStream) {
            latest = partial;
            const spec = parseImplementationSpec(partial, fallbackSpec);

            if (!sentKind && spec.appKind) {
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

          return parseImplementationSpec(latest, fallbackSpec);
        }

        const implementationSpec = await generateImplementationSpec(
          buildImplementationSpecPrompt(brief),
        );
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
        devLog("generate", "source.generated", {
          buildSpecLength: sourceGeneration.buildSpec.length,
          files: sourceGeneration.files.length,
          mode: sourceGeneration.generationMode,
          projectId: projectId,
          touchedFiles: sourceGeneration.touchedFiles.length,
        });
        const sourceFiles = sourceGeneration.files;
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
        const build = await prisma.projectBuild.create({
          data: {
            projectId: projectId,
            snapshotId: snapshot.id,
            status: "queued" satisfies ProjectBuildStatus,
          },
          select: { id: true },
        });
        runtimeBuildId = build.id;
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
        send("progress", {
          label: buildResult.ok
            ? "Build website berhasil"
            : "Build website gagal",
          detail: buildResult.ok
            ? "File website berhasil divalidasi."
            : "File website tetap disimpan, tapi build log perlu dicek di tab Kode.",
        });
        const latestProject = await prisma.project.findUnique({
          where: { id: projectId },
          select: { status: true },
        });

        if (latestProject?.status === "stopping") {
          await prisma.projectBuild.update({
            where: { id: build.id },
            data: {
              finishedAt: new Date(),
              logText: buildResult.log,
              status: "canceled" satisfies ProjectBuildStatus,
            },
          });
          runtimeBuildFinalized = true;
          await prisma.runtimeEvent.create({
            data: createRuntimeEventData({
              buildId: build.id,
              message: "Build was canceled after the user stopped the job.",
              projectId: projectId,
              type: "build.canceled",
            }),
          });
          await prisma.project.update({
            where: { id: projectId },
            data: { status: "draft", buildStatus: "stopped" } as Parameters<
              typeof prisma.project.update
            >[0]["data"],
          });
          send("error", { message: "Proses dihentikan." });
          return;
        }

        const projectBuildStatus: ProjectBuildStatus = buildResult.ok
          ? "succeeded"
          : "failed";
        const artifactRef = buildResult.ok
          ? await writeProjectDistArtifact({
              artifactId: build.id,
              files: buildResult.distFiles,
            })
          : null;
        await prisma.projectBuild.update({
          where: { id: build.id },
          data: {
            artifactRef,
            finishedAt: new Date(),
            logText: buildResult.log,
            status: projectBuildStatus,
          },
        });
        runtimeBuildFinalized = true;
        await prisma.runtimeEvent.create({
          data: createRuntimeEventData({
            buildId: build.id,
            message: buildResult.ok
              ? "Generated frontend build succeeded and dist artifact was stored."
              : "Generated frontend build failed.",
            metadata: artifactRef ? { artifactRef } : undefined,
            projectId: projectId,
            type: buildResult.ok ? "build.succeeded" : "build.failed",
          }),
        });
        await prisma.project.update({
          where: { id: projectId },
          data: {
            status: buildResult.ok ? "ready" : "failed",
            siteSchema: finalSchema,
            sourceFiles,
            distFiles: buildResult.distFiles,
            buildStatus: buildResult.ok ? "passed" : "failed",
            buildLog: buildResult.log,
            builtAt: new Date(),
          } as Parameters<typeof prisma.project.update>[0]["data"],
        });
        const deploymentStatus: ProjectDeploymentStatus = buildResult.ok
          ? "created"
          : "failed";
        const deployment = await prisma.projectDeployment.create({
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
        await prisma.runtimeEvent.create({
          data: createRuntimeEventData({
            buildId: build.id,
            deploymentId: deployment.id,
            projectId: projectId,
            type: buildResult.ok ? "deployment.created" : "deployment.failed",
          }),
        });

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
        await prisma.project.update({
          where: { id: projectId },
          data: { status: "failed", buildStatus: "failed" },
        });
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
