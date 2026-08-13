import { createFileRoute } from "@tanstack/react-router";

import { projectWhere } from "@/lib/admin-projects";
import { requireAdmin } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";
import { getUnreadCounts } from "@/lib/support/service";
import { WAITLIST_PENDING_STATUSES } from "@/lib/waitlist";

export const Route = createFileRoute("/api/admin/nav-counts")({
  server: {
    handlers: {
      GET: async () => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }

        try {
          const activeWhere = projectWhere("active");
          const [
            waitlistPending,
            paymentsPending,
            projectsActive,
            ticketCounts,
          ] = await Promise.all([
            prisma.waitlistEntry.count({
              where: { status: { in: [...WAITLIST_PENDING_STATUSES] } },
            }),
            prisma.payment.count({ where: { status: "PENDING" } }),
            prisma.project.count({ where: activeWhere }),
            getUnreadCounts({
              userId: admin.admin.userId,
              isAdmin: true,
            }),
          ]);

          return Response.json({
            waitlistPending,
            ticketsUnread: ticketCounts.adminUnreadCount,
            paymentsPending,
            projectsActive,
          });
        } catch {
          return Response.json(
            { message: "Gagal memuat badge navigasi admin." },
            { status: 500 },
          );
        }
      },
    },
  },
});
