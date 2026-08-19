import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/admin/tickets/$ticketId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }

        const ticket = await prisma.supportTicket.findUnique({
          where: { id: params.ticketId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
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

        // Mark counterpart (user) messages as read for this ticket in background
        void prisma.supportMessage
          .updateMany({
            where: {
              ticketId: params.ticketId,
              authorRole: "user",
              isRead: false,
            },
            data: {
              isRead: true,
              readAt: new Date(),
            },
          })
          .catch(() => {});

        return Response.json({ ticket });
      },
    },
  },
});
