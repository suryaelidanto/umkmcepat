import { jsonSchema, Output, streamText } from "ai";

import { getAiModel } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { briefToBuildPrompt, parseProjectBrief } from "@/lib/projects/brief";
import { generateCustomProjectFilesWithAgent } from "@/lib/projects/custom-source-generator";
import {
  buildGeneratedProject,
  createGeneratedSourceSnapshotMetadata,
} from "@/lib/projects/generated-source";
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
import {
  createProjectSiteSchemaFromBrief,
  parseProjectSiteSchema,
  resolveProjectSiteSchemaCandidate,
  projectSiteJsonSchema,
  type ProjectSiteSchema,
} from "@/lib/projects/site-schema";
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

function buildSchemaRepairPrompt(buildPrompt: string, issues: string[]) {
  return `${buildPrompt}

Hasil rancangan sebelumnya ditolak oleh quality gate: ${issues.join(", ")}.
Perbaiki dengan schema lengkap dan spesifik untuk brief di atas.
Jangan pakai copy generik seperti "Permintaan awal", "Produk dan layanan usaha", atau "Website usaha".
Pastikan offer, target pelanggan, CTA, dan gaya visual brief muncul jelas di headline, sections, dan trustPoints.`;
}

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

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: { id: true, prompt: true },
  });

  if (!project) {
    return Response.json(
      { message: "Proyek tidak ditemukan." },
      { status: 404 },
    );
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { status: "building" },
  });

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
          SELECT "brief" FROM "Project" WHERE id = ${project.id} AND "userId" = ${userId}
        `;
        const brief = parseProjectBrief(briefRow?.brief, project.prompt);
        const buildPrompt = briefToBuildPrompt(brief);
        const fallbackSchema = createProjectSiteSchemaFromBrief(brief);

        async function generateSiteSchema(prompt: string) {
          const result = streamText({
            model: getAiModel(),
            temperature: 0.35,
            output: Output.object({
              name: "ProjectSiteSchema",
              description:
                "A safe website schema for a polished small-business landing page. Output Indonesian copy only.",
              schema: jsonSchema<ProjectSiteSchema>(projectSiteJsonSchema),
            }),
            system: projectSiteGenerationSystemPrompt,
            prompt,
            onError() {
              send("progress", {
                label: "AI mengalami kendala",
                detail:
                  "UMKM Cepat akan memeriksa ulang hasil sebelum build dilanjutkan.",
              });
            },
          });

          let latest: unknown;
          let sentCopy = false;
          let sentDesign = false;
          let sentSections = false;

          for await (const partial of result.partialOutputStream) {
            latest = partial;
            const schema = parseProjectSiteSchema(partial, fallbackSchema);

            if (!sentCopy && schema.headline !== fallbackSchema.headline) {
              sentCopy = true;
              send("progress", {
                label: "Menulis pesan utama",
                detail: `Headline sementara: ${schema.headline}`,
              });
            }

            if (
              !sentDesign &&
              partial &&
              typeof partial === "object" &&
              "theme" in partial
            ) {
              sentDesign = true;
              send("progress", {
                label: "Memilih arah visual",
                detail: "Warna, CTA, dan struktur halaman mulai disusun.",
              });
            }

            if (!sentSections && schema.sections.length >= 4) {
              sentSections = true;
              send("progress", {
                label: "Menyusun bagian halaman",
                detail: `${schema.sections.length} bagian siap ditampilkan di website.`,
              });
            }

            send("schema", schema);
          }

          return resolveProjectSiteSchemaCandidate({
            brief,
            fallbackSchema,
            value: latest,
          });
        }

        let schemaResult = await generateSiteSchema(buildPrompt);

        if (schemaResult.issues.length) {
          send("progress", {
            label: "Memperbaiki rancangan website",
            detail:
              "Hasil pertama belum cukup spesifik, AI diminta memperbaiki sekali lagi.",
          });
          schemaResult = await generateSiteSchema(
            buildSchemaRepairPrompt(buildPrompt, schemaResult.issues),
          );
        }

        if (schemaResult.issues.length) {
          const message = `AI site schema failed quality gate: ${schemaResult.issues.join(", ")}`;

          await prisma.project.update({
            where: { id: project.id },
            data: {
              status: "failed",
              buildStatus: "failed",
              buildLog: message,
            } as Parameters<typeof prisma.project.update>[0]["data"],
          });
          await prisma.runtimeEvent.create({
            data: createRuntimeEventData({
              message,
              projectId: project.id,
              type: "build.failed",
            }),
          });
          send("error", {
            message:
              "AI belum menghasilkan rancangan website yang cukup spesifik. Coba jawab lebih detail atau jalankan build ulang.",
          });
          return;
        }

        const finalSchema = schemaResult.schema;
        send("progress", {
          label: "Menyiapkan starter React",
          detail: "Vite React TypeScript dan TanStack Router disiapkan.",
        });
        const sourceGeneration = await generateCustomProjectFilesWithAgent({
          projectId: project.id,
          schema: finalSchema,
        });
        const sourceFiles = sourceGeneration.files;
        send("progress", {
          label:
            sourceGeneration.generationMode === "agent-custom"
              ? "AI menulis file website"
              : "AI memakai fallback aman",
          detail:
            sourceGeneration.generationMode === "agent-custom"
              ? `${sourceGeneration.touchedFiles.length} file dibuat atau diubah agent.`
              : `Fallback dipakai: ${sourceGeneration.fallbackReason}`,
        });
        const snapshot = await prisma.projectSnapshot.create({
          data: {
            files: sourceFiles,
            metadata: createGeneratedSourceSnapshotMetadata(
              sourceFiles,
              finalSchema,
              sourceGeneration,
            ),
            projectId: project.id,
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
            projectId: project.id,
            type: "build.started",
          }),
        });
        const buildResult = await buildGeneratedProject(sourceFiles);
        send("progress", {
          label: buildResult.ok
            ? "Build website berhasil"
            : "Build website gagal",
          detail: buildResult.ok
            ? "File website berhasil divalidasi."
            : "File website tetap disimpan, tapi build log perlu dicek di tab Kode.",
        });
        const latestProject = await prisma.project.findUnique({
          where: { id: project.id },
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
              projectId: project.id,
              type: "build.canceled",
            }),
          });
          await prisma.project.update({
            where: { id: project.id },
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
            projectId: project.id,
            type: buildResult.ok ? "build.succeeded" : "build.failed",
          }),
        });
        await prisma.project.update({
          where: { id: project.id },
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
            projectId: project.id,
            publicPath: `/api/projects/${project.id}/preview`,
            snapshotId: snapshot.id,
            status: deploymentStatus,
          },
          select: { id: true },
        });
        await prisma.runtimeEvent.create({
          data: createRuntimeEventData({
            buildId: build.id,
            deploymentId: deployment.id,
            projectId: project.id,
            type: buildResult.ok ? "deployment.created" : "deployment.failed",
          }),
        });

        send("progress", {
          label: "Website siap dicek",
          detail: "Tampilan dan file website sudah siap dicek.",
        });
        send("done", finalSchema);
      } catch {
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
                projectId: project.id,
                type: "build.failed",
              }),
            })
            .catch(() => undefined);
        }
        await prisma.project.update({
          where: { id: project.id },
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
