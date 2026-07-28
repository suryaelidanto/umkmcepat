import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
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

        return Response.json({ ticket });
      },
    },
  },
});
