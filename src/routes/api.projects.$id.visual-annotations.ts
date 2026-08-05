import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { isBoundedJsonError, readBoundedJson } from "@/lib/bounded-json";
import { prisma } from "@/lib/prisma";
import { sanitizeVisualAnnotations } from "@/lib/projects/visual-annotations";
import { isAdminEmail } from "@/lib/waitlist";

export const Route = createFileRoute("/api/projects/$id/visual-annotations")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const admin = isAdminEmail(session.user.email ?? "");
        const project = await prisma.project.findFirst({
          where: {
            id: params.id,
            ...(admin ? {} : { userId: session.user.id }),
          },
          select: { visualAnnotations: true },
        });

        if (!project) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        return Response.json({
          annotations: sanitizeVisualAnnotations(project.visualAnnotations),
        });
      },
      PUT: async ({ request, params }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        let body: { annotations?: unknown };

        try {
          body = (await readBoundedJson(request, {
            maxBytes: 128 * 1024,
          })) as { annotations?: unknown };
        } catch (error) {
          if (isBoundedJsonError(error)) {
            return Response.json(
              { code: error.code, message: "Komentar visual belum valid." },
              { status: error.code === "request_body_too_large" ? 413 : 400 },
            );
          }
          throw error;
        }

        const annotations = sanitizeVisualAnnotations(body.annotations);
        const project = await prisma.project.updateMany({
          where: { id: params.id, userId: session.user.id },
          data: { visualAnnotations: annotations },
        });

        if (!project.count) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        return Response.json({ annotations });
      },
    },
  },
});
