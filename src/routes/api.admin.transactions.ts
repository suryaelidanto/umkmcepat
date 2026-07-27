import { Prisma } from "@prisma/client";
import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/api/admin/transactions")({
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
        const status = url.searchParams.get("status") ?? "ALL";
        const q = url.searchParams.get("q")?.trim() ?? "";
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
        const where: Prisma.PaymentWhereInput = {};
        if (status !== "ALL") {
          where.status = status;
        }
        if (q) {
          where.OR = [
            { orderId: { contains: q, mode: "insensitive" as const } },
            { user: { email: { contains: q, mode: "insensitive" as const } } },
          ];
        }
        const [payments, total] = await Promise.all([
          prisma.payment.findMany({
            orderBy: { createdAt: "desc" },
            take: PAGE_SIZE,
            skip: (page - 1) * PAGE_SIZE,
            where,
            select: {
              amount: true,
              createdAt: true,
              energyGranted: true,
              orderId: true,
              paymentMethod: true,
              paymentNumber: true,
              status: true,
              updatedAt: true,
              user: { select: { email: true } },
            },
          }),
          prisma.payment.count({ where }),
        ]);
        return Response.json({
          payments: payments.map((p) => ({
            amount: p.amount,
            createdAt: p.createdAt.toISOString(),
            email: p.user.email,
            energyGranted: p.energyGranted,
            orderId: p.orderId,
            paymentMethod: p.paymentMethod,
            paymentNumber: p.paymentNumber,
            status: p.status,
            updatedAt: p.updatedAt.toISOString(),
          })),
          page,
          total,
          totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        });
      },
    },
  },
});
