import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";
import { WAITLIST_PENDING_STATUSES } from "@/lib/waitlist";

export const Route = createFileRoute("/api/admin/overview")({
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

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [
          users,
          waitlistPending,
          projects,
          paymentsThisMonth,
          revenueAgg,
          recentWaitlist,
          recentTransactions,
        ] = await Promise.all([
          prisma.user.count(),
          prisma.waitlistEntry.count({
            where: { status: { in: [...WAITLIST_PENDING_STATUSES] } },
          }),
          prisma.project.count(),
          prisma.payment.count({
            where: { status: "COMPLETED", createdAt: { gte: monthStart } },
          }),
          prisma.payment.aggregate({
            _sum: { amount: true },
            where: { status: "COMPLETED", createdAt: { gte: monthStart } },
          }),
          prisma.waitlistEntry.findMany({
            orderBy: { submittedAt: "desc" },
            take: 5,
            where: { status: { in: [...WAITLIST_PENDING_STATUSES] } },
            select: {
              businessName: true,
              id: true,
              submittedAt: true,
            },
          }),
          prisma.payment.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              amount: true,
              createdAt: true,
              orderId: true,
              status: true,
            },
          }),
        ]);

        return Response.json({
          recentTransactions,
          recentWaitlist: recentWaitlist.map((e) => ({
            businessName: e.businessName,
            id: e.id,
            submittedAt: e.submittedAt.toISOString(),
          })),
          stats: {
            paymentsThisMonth,
            projects,
            revenueThisMonth: revenueAgg._sum.amount ?? 0,
            users,
            waitlistPending,
          },
        });
      },
    },
  },
});
