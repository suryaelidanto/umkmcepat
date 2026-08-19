import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { prisma } from "@/lib/prisma";
import { WAITLIST_PENDING_STATUSES } from "@/lib/waitlist/waitlist";

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

        // Daily breakdown for the last 7 days (Real Data)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setHours(0, 0, 0, 0);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        const [
          users,
          waitlistPending,
          projectsReady,
          ticketsOpen,
          revenueThisMonthAgg,
          dailyPayments,
          dailyUsers,
          recentWaitlist,
          recentTransactions,
        ] = await Promise.all([
          prisma.user.count(),
          prisma.waitlistEntry.count({
            where: { status: { in: [...WAITLIST_PENDING_STATUSES] } },
          }),
          prisma.project.count({
            where: {
              OR: [
                {
                  buildStatus: {
                    in: ["ready", "passed", "succeeded", "built"],
                  },
                },
                { status: { in: ["ready", "passed", "succeeded", "built"] } },
              ],
            },
          }),
          prisma.supportTicket.count({
            where: { status: "OPEN" },
          }),
          prisma.payment.aggregate({
            _sum: { amount: true },
            where: { status: "COMPLETED", createdAt: { gte: monthStart } },
          }),
          prisma.payment.findMany({
            where: {
              status: "COMPLETED",
              createdAt: { gte: sevenDaysAgo },
            },
            select: { amount: true, createdAt: true },
          }),
          prisma.user.findMany({
            where: {
              createdAt: { gte: sevenDaysAgo },
            },
            select: { createdAt: true },
          }),
          prisma.waitlistEntry.findMany({
            orderBy: { submittedAt: "desc" },
            take: 6,
            select: {
              id: true,
              businessName: true,
              businessType: true,
              status: true,
              submittedAt: true,
            },
          }),
          prisma.payment.findMany({
            orderBy: { createdAt: "desc" },
            take: 6,
            include: {
              user: {
                select: {
                  email: true,
                  name: true,
                },
              },
            },
          }),
        ]);

        // Aggregate 7-day revenue trend from real completed payments
        const dailyTrendMap = new Map<
          string,
          { date: string; revenue: number; signups: number }
        >();
        for (let i = 0; i < 7; i++) {
          const d = new Date(sevenDaysAgo);
          d.setDate(d.getDate() + i);
          const key = d.toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
          });
          dailyTrendMap.set(key, { date: key, revenue: 0, signups: 0 });
        }

        dailyPayments.forEach((p) => {
          const key = new Date(p.createdAt).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
          });
          const entry = dailyTrendMap.get(key);
          if (entry) {
            entry.revenue += p.amount;
          }
        });

        dailyUsers.forEach((u) => {
          const key = new Date(u.createdAt).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
          });
          const entry = dailyTrendMap.get(key);
          if (entry) {
            entry.signups += 1;
          }
        });

        const trend7Days = Array.from(dailyTrendMap.values());

        return Response.json({
          recentTransactions: recentTransactions.map((t) => ({
            id: t.id,
            orderId: t.orderId,
            status: t.status,
            amount: t.amount,
            createdAt: t.createdAt.toISOString(),
            user: t.user,
          })),
          recentWaitlist: recentWaitlist.map((e) => ({
            id: e.id,
            businessName: e.businessName,
            businessType: e.businessType,
            status: e.status,
            submittedAt: e.submittedAt.toISOString(),
          })),
          stats: {
            users,
            waitlistPending,
            projectsReady,
            ticketsOpen,
            revenueThisMonth: revenueThisMonthAgg._sum.amount ?? 0,
          },
          trend7Days,
        });
      },
    },
  },
});
