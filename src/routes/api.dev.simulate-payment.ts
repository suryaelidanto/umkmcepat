import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { devLog } from "@/lib/dev-log";
import { sendPaymentReceipt } from "@/lib/email/templates";
import { logCreditTransaction } from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";
import { isDev } from "@/lib/utils";

export const Route = createFileRoute("/api/dev/simulate-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isDev) {
          return Response.json(
            { message: "Hanya tersedia pada development mode." },
            { status: 403 },
          );
        }

        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Unauthorized. Sesi login tidak ditemukan." },
            { status: 401 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          orderId?: string;
        };

        if (!body.orderId) {
          return Response.json(
            { message: "orderId wajib diisi." },
            { status: 400 },
          );
        }

        const payment = await prisma.payment.findUnique({
          where: { orderId: body.orderId },
        });

        if (!payment) {
          return Response.json(
            { message: "Transaksi tidak ditemukan." },
            { status: 404 },
          );
        }

        // Must own the payment in dev simulate
        if (payment.userId !== session.user.id) {
          return Response.json(
            { message: "Transaksi bukan milik user yang sedang aktif." },
            { status: 403 },
          );
        }

        if (payment.status === "COMPLETED") {
          return Response.json({
            success: true,
            message: "Transaksi sudah selesai sebelumnya.",
          });
        }

        const packageName =
          (payment.metadata as { packageName?: string })?.packageName ||
          "Energy Booster";

        const result = await prisma.$transaction(async (tx) => {
          const claimed = await tx.payment.updateMany({
            where: { orderId: body.orderId, status: "PENDING" },
            data: {
              status: "COMPLETED",
              paymentMethod: "DEV_SIMULATION",
              updatedAt: new Date(),
            },
          });

          if (claimed.count !== 1) {
            return null;
          }

          const premiumExpiry = new Date("9999-12-31T23:59:59.999Z");

          await tx.$executeRaw`
            INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
            VALUES (
              ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
              ${payment.userId},
              ${payment.energyGranted},
              0,
              0,
              ${`Top-up (Simulasi): ${packageName}`.slice(0, 64)},
              ${premiumExpiry},
              NOW()
            )
          `;

          return {
            userId: payment.userId,
            energyGranted: payment.energyGranted,
            packageName,
          };
        });

        if (result) {
          logCreditTransaction({
            type: "credit",
            userId: result.userId,
            amount: result.energyGranted,
            reason: `Top-up: ${result.packageName}`,
            projectId: null,
          });

          if (session.user.email) {
            sendPaymentReceipt(session.user.email, {
              packageName: result.packageName,
              amount: payment.amount,
              energyGranted: result.energyGranted,
              transactionId: payment.providerTxnId ?? payment.orderId,
            }).catch(() => undefined);
          }

          devLog(
            "payment",
            `[DEV] Successfully simulated payment for orderId: ${body.orderId}`,
          );
        }

        return Response.json({
          success: true,
          status: "SUCCESS",
          message: "Simulasi pembayaran berhasil.",
        });
      },
    },
  },
});
