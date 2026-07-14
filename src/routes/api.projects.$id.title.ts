import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/projects/$id/title")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const { id } = params;
        const body = (await request.json().catch(() => ({}))) as {
          title?: string;
        };
        const title = body.title?.trim().replace(/\s+/g, " ").slice(0, 80);

        if (!title) {
          return Response.json(
            { message: "Nama proyek tidak boleh kosong." },
            { status: 400 },
          );
        }

        const project = await prisma.project.findFirst({
          where: { id, userId: session.user.id },
          select: { id: true },
        });

        if (!project) {
          return Response.json(
            { message: "Proyek tidak ditemukan." },
            { status: 404 },
          );
        }

        await prisma.project.update({
          where: { id: project.id },
          data: { title },
        });

        return Response.json({ title });
      },
    },
  },
});
