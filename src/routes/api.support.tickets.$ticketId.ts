import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addMessage } from "@/lib/support/service";

export const Route = createFileRoute("/api/support/tickets/$ticketId")({
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

        const ticket = await prisma.supportTicket.findUnique({
          where: { id: params.ticketId },
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
            },
          },
        });

        if (!ticket) {
          return Response.json(
            { message: "Tiket tidak ditemukan." },
            { status: 404 },
          );
        }

        if (ticket.userId !== session.user.id) {
          return Response.json({ message: "Akses ditolak." }, { status: 403 });
        }

        return Response.json({ ticket });
      },

      POST: async ({ request, params }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const ticket = await prisma.supportTicket.findUnique({
          where: { id: params.ticketId },
        });

        if (!ticket) {
          return Response.json(
            { message: "Tiket tidak ditemukan." },
            { status: 404 },
          );
        }

        if (ticket.userId !== session.user.id) {
          return Response.json({ message: "Akses ditolak." }, { status: 403 });
        }

        const body = (await request.json().catch(() => ({}))) as {
          body?: string;
          assetIds?: string[];
        };

        if (!body.body) {
          return Response.json(
            { message: "Pesan wajib diisi." },
            { status: 400 },
          );
        }

        try {
          const result = await addMessage({
            ticketId: params.ticketId,
            authorId: session.user.id,
            authorRole: "user",
            body: body.body,
            assetIds: body.assetIds,
          });

          return Response.json(result, { status: 201 });
        } catch (error) {
          return Response.json(
            {
              message:
                error instanceof Error
                  ? error.message
                  : "Gagal mengirim pesan.",
            },
            { status: 400 },
          );
        }
      },
    },
  },
});
