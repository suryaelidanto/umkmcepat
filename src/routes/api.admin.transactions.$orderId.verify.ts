import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { getMayarTransaction } from "@/lib/mayar";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/admin/transactions/$orderId/verify")(
  {
    server: {
      handlers: {
        POST: async ({ params }) => {
          const admin = await requireAdmin();
          if (!admin.ok) {
            return Response.json(
              { message: admin.message },
              { status: admin.status },
            );
          }
          const { orderId } = params;
          const payment = await prisma.payment.findUnique({
            where: { orderId },
            select: {
              amount: true,
              status: true,
              providerTxnId: true,
              userId: true,
              energyGranted: true,
              metadata: true,
            },
          });
          if (!payment) {
            return Response.json(
              { message: "Transaksi tidak ditemukan." },
              { status: 404 },
            );
          }
          if (payment.status !== "PENDING") {
            return Response.json({
              status: payment.status,
              message: "Hanya transaksi pending yang bisa diverifikasi.",
            });
          }
          if (!payment.providerTxnId) {
            return Response.json(
              {
                message:
                  "Transaksi ini adalah pembayaran pre-migration (Pakasir) dan tidak bisa diverifikasi lewat Mayar.",
              },
              { status: 400 },
            );
          }
          try {
            const detail = await getMayarTransaction(payment.providerTxnId);

            if (detail.status !== "paid") {
              return Response.json({
                success: false,
                status: detail.status,
                message: `Payment not completed. Current status: ${detail.status}`,
              });
            }

            await prisma.$transaction(async (tx) => {
              const claimed = await tx.payment.updateMany({
                where: { orderId, status: "PENDING" },
                data: {
                  status: "COMPLETED",
                  paymentMethod: detail.paymentMethod,
                  providerTxnId: payment.providerTxnId,
                  updatedAt: new Date(),
                },
              });
              if (claimed.count !== 1) {
                return;
              }

              const packageName =
                (payment.metadata as { packageName?: string })?.packageName ??
                "Energy Booster";
              const premiumExpiry = new Date("9999-12-31T23:59:59.999Z");

              await tx.$executeRaw`
                INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
                VALUES (
                  ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
                  ${payment.userId},
                  ${payment.energyGranted},
                  0,
                  0,
                  ${`Top-up: ${packageName}`.slice(0, 64)},
                  ${premiumExpiry},
                  NOW()
                )
              `;
            });

            return Response.json({ success: true, status: "COMPLETED" });
          } catch {
            return Response.json(
              { message: "Gagal verifikasi via Mayar." },
              { status: 502 },
            );
          }
        },
      },
    },
  },
);
