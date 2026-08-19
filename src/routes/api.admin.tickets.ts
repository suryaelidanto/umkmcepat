import { Prisma, SupportCategory, SupportTicketStatus } from "@prisma/client";
import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/admin/tickets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }

        const url = new URL(request.url);
        const status = url.searchParams.get(
          "status",
        ) as SupportTicketStatus | null;
        const category = url.searchParams.get(
          "category",
        ) as SupportCategory | null;
        const q = url.searchParams.get("q")?.trim() ?? "";

        const where: Prisma.SupportTicketWhereInput = {};
        if (status && Object.values(SupportTicketStatus).includes(status)) {
          where.status = status;
        }
        if (category && Object.values(SupportCategory).includes(category)) {
          where.category = category;
        }
        if (q) {
          where.OR = [
            { subject: { contains: q, mode: "insensitive" } },
            { user: { email: { contains: q, mode: "insensitive" } } },
            { user: { name: { contains: q, mode: "insensitive" } } },
          ];
        }

        const tickets = await prisma.supportTicket.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        });

        return Response.json({ tickets });
      },
    },
  },
});
