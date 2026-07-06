import { jsonSchema, Output, streamText } from "ai";

import { getAiModel } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { briefToBuildPrompt, parseProjectBrief } from "@/lib/projects/brief";
import {
  buildGeneratedProject,
  createGeneratedProjectFiles,
} from "@/lib/projects/generated-source";
import { projectSiteGenerationSystemPrompt } from "@/lib/projects/site-generation";
import {
  parseProjectSiteSchema,
  projectSiteJsonSchema,
  type ProjectSiteSchema,
} from "@/lib/projects/site-schema";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 180;

type RouteProps = {
  params: Promise<{ id: string }>;
};

function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
        const buildPrompt = briefToBuildPrompt(
          parseProjectBrief(briefRow?.brief, project.prompt),
        );

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
          prompt: buildPrompt,
          onError() {
            send("progress", {
              label: "AI mengalami kendala",
              detail: "UMKM Cepat akan memakai versi aman sementara.",
            });
          },
        });

        let latest: unknown;
        let sentCopy = false;
        let sentDesign = false;
        let sentSections = false;

        for await (const partial of result.partialOutputStream) {
          latest = partial;
          const schema = parseProjectSiteSchema(partial, buildPrompt);

          if (!sentCopy && schema.headline !== buildPrompt) {
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
              detail: `${schema.sections.length} bagian siap dirender di preview.`,
            });
          }

          send("schema", schema);
        }

        const finalSchema = parseProjectSiteSchema(latest, buildPrompt);
        const sourceFiles = createGeneratedProjectFiles(
          project.id,
          finalSchema,
        );
        send("progress", {
          label: "Membuat source frontend",
          detail: `${sourceFiles.length} file Vite React disiapkan untuk project ini.`,
        });
        const buildResult = await buildGeneratedProject(sourceFiles);
        send("progress", {
          label: buildResult.ok
            ? "Build frontend berhasil"
            : "Build frontend gagal",
          detail: buildResult.ok
            ? "Source project berhasil divalidasi dengan bun run build."
            : "Source tetap disimpan, tapi build log perlu dicek di tab Code.",
        });
        const latestProject = await prisma.project.findUnique({
          where: { id: project.id },
          select: { status: true },
        });

        if (latestProject?.status === "stopping") {
          await prisma.project.update({
            where: { id: project.id },
            data: { status: "draft", buildStatus: "stopped" } as Parameters<
              typeof prisma.project.update
            >[0]["data"],
          });
          send("error", { message: "Proses dihentikan." });
          return;
        }

        await prisma.project.update({
          where: { id: project.id },
          data: {
            status: "ready",
            siteSchema: finalSchema,
            sourceFiles,
            distFiles: buildResult.distFiles,
            buildStatus: buildResult.ok ? "passed" : "failed",
            buildLog: buildResult.log,
            builtAt: new Date(),
          } as Parameters<typeof prisma.project.update>[0]["data"],
        });

        send("progress", {
          label: "Website siap direview",
          detail: "Preview, changes, dan source frontend sudah siap dicek.",
        });
        send("done", finalSchema);
      } catch {
        await prisma.project.update({
          where: { id: project.id },
          data: { status: "draft" },
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
