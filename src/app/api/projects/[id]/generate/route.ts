import { jsonSchema, Output, streamText } from "ai";

import { getAiModel } from "@/lib/ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectSiteGenerationSystemPrompt } from "@/lib/projects/site-generation";
import {
  parseProjectSiteSchema,
  projectSiteJsonSchema,
  type ProjectSiteSchema,
} from "@/lib/projects/site-schema";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

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

  const rateLimitResponse = await checkRateLimit(request, "ai");

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
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
          prompt: project.prompt,
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
          const schema = parseProjectSiteSchema(partial, project.prompt);

          if (!sentCopy && schema.headline !== project.prompt) {
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

        const finalSchema = parseProjectSiteSchema(latest, project.prompt);
        await prisma.project.update({
          where: { id: project.id },
          data: {
            status: "ready",
            siteSchema: finalSchema,
          } as Parameters<typeof prisma.project.update>[0]["data"],
        });

        send("progress", {
          label: "Website siap direview",
          detail: "Preview kanan sudah memakai schema final dari AI.",
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
