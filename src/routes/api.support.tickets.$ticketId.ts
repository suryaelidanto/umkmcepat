import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { addMessage, invalidateUnreadCache } from "@/lib/support/service";
import { mapToUserFacingError } from "@/lib/user-facing-error";

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

        // Mark counterpart (admin) messages as read for this ticket
        await prisma.supportMessage.updateMany({
          where: {
            ticketId: params.ticketId,
            authorRole: "admin",
            isRead: false,
          },
          data: {
            isRead: true,
            readAt: new Date(),
          },
        });

        // Invalidate unread cache so counts sync immediately
        invalidateUnreadCache(session.user.id);

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

        const messageText =
          typeof body.body === "string" ? body.body.trim() : "";
        const assetIds = Array.isArray(body.assetIds) ? body.assetIds : [];

        if (!messageText && assetIds.length === 0) {
          return Response.json(
            { message: "Tulis pesan atau lampirkan gambar." },
            { status: 400 },
          );
        }

        try {
          const result = await addMessage({
            ticketId: params.ticketId,
            authorId: session.user.id,
            authorRole: "user",
            body: messageText,
            assetIds,
          });

          return Response.json(result, { status: 201 });
        } catch (error) {
          const raw = error instanceof Error ? error.message : "";
          console.error("[support] ticket message failed:", raw);
          return Response.json(
            { message: mapToUserFacingError(raw) },
            { status: 400 },
          );
        }
      },
    },
  },
});
