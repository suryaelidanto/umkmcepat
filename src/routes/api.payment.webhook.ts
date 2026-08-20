import { createFileRoute } from "@tanstack/react-router";

import { devLog } from "@/lib/dev-log";
import { sendPaymentReceipt } from "@/lib/email/templates";
import {
  getMayarTransaction,
  verifyMayarWebhookRequest,
} from "@/lib/payment/mayar";
import { logCreditTransaction } from "@/lib/payment/user-credits";
import { prisma } from "@/lib/prisma";

interface MayarWebhookPayload {
  event: string;
  data: {
    id: string;
    transactionId?: string;
    transactionStatus?: string;
    status?: string;
    amount?: number;
    paymentMethod?: string;
  };
}

export const Route = createFileRoute("/api/payment/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyMayarWebhookRequest(request)) {
          console.warn(
            "[webhook] Rejected request with invalid webhook token.",
          );
          return Response.json(
            { message: "Invalid webhook token." },
            { status: 401 },
          );
        }

        let payload: MayarWebhookPayload;

        try {
          payload = (await request.json()) as MayarWebhookPayload;
        } catch {
          return Response.json(
            { message: "Invalid JSON body." },
            { status: 400 },
          );
        }

        // Structured log after verification, before any DB access.
        devLog("payment", `Received event: ${payload.event}`);

        if (payload.event !== "payment.received") {
          return Response.json({
            success: true,
            message: `Ignored event: ${payload.event}`,
          });
        }

        const transactionId = payload.data?.transactionId ?? payload.data?.id;

        if (!transactionId) {
          return Response.json(
            { message: "Missing data.transactionId in webhook payload." },
            { status: 400 },
          );
        }

        try {
          // 1. Fetch payment record from database, correlated via providerTxnId
          const payment = await prisma.payment.findUnique({
            where: { providerTxnId: transactionId },
          });

          if (!payment) {
            console.warn(
              `[webhook] Payment not found for transactionId ${transactionId}`,
            );
            return Response.json(
              { message: "Payment not found." },
              { status: 404 },
            );
          }

          // If the payment is already completed or processed, do nothing (idempotency check).
          if (payment.status !== "PENDING") {
            return Response.json({
              success: true,
              message: `Payment already in status: ${payment.status}`,
            });
          }

          // 2. Direct Verification API call (essential security verification).
          const verifiedTransaction = await getMayarTransaction(transactionId);

          if (verifiedTransaction.status !== "paid") {
            console.warn(
              `[webhook] Direct verification status is "${verifiedTransaction.status}", expected "paid" for transactionId ${transactionId}`,
            );
            return Response.json({
              success: false,
              message: `Transaction not fully completed. Current status: ${verifiedTransaction.status}`,
            });
          }

          if (verifiedTransaction.amount !== payment.amount) {
            console.warn(
              `[webhook] Verified amount ${verifiedTransaction.amount} does not match stored payment amount ${payment.amount} for transactionId ${transactionId}`,
            );
            return Response.json({
              success: false,
              message:
                "Verified transaction amount does not match payment amount.",
            });
          }

          // 3. Process completed payment inside transaction to guarantee consistency and prevent duplicates.
          const result = await prisma.$transaction(async (tx) => {
            // Atomic claim: exactly one concurrent transaction can transition
            const claimed = await tx.payment.updateMany({
              where: { providerTxnId: transactionId, status: "PENDING" },
              data: {
                status: "COMPLETED",
                paymentMethod: verifiedTransaction.paymentMethod,
                updatedAt: new Date(),
              },
            });

            if (claimed.count !== 1) {
              return null;
            }

            const txPayment = await tx.payment.findUniqueOrThrow({
              where: { providerTxnId: transactionId },
            });

            // Grant energy credits.
            const premiumExpiry = new Date("9999-12-31T23:59:59.999Z");
            const packageName =
              (txPayment.metadata as { packageName?: string })?.packageName ||
              "Energy Booster";

            await tx.$executeRaw`
              INSERT INTO "UserCredit" ("id", "userId", "amount", "inputTokens", "outputTokens", "reason", "expiresAt", "createdAt")
              VALUES (
                ${`c${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`},
                ${txPayment.userId},
                ${txPayment.energyGranted},
                0,
                0,
                ${`Top-up: ${packageName}`.slice(0, 64)},
                ${premiumExpiry},
                NOW()
              )
            `;

            return {
              userId: txPayment.userId,
              energyGranted: txPayment.energyGranted,
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

            // Non-fatal email receipt
            prisma.user
              .findUnique({
                where: { id: result.userId },
                select: { email: true },
              })
              .then((user) => {
                if (user?.email) {
                  sendPaymentReceipt(user.email, {
                    packageName: result.packageName,
                    amount: payment.amount,
                    energyGranted: result.energyGranted,
                    transactionId,
                  }).catch(() => undefined);
                }
              })
              .catch(() => undefined);
          }

          if (!result) {
            devLog(
              "payment",
              `Race condition: payment for transactionId ${transactionId} already claimed by another handler`,
            );
          }

          devLog(
            "payment",
            `Successfully processed payment for transactionId: ${transactionId}`,
          );
          return Response.json({
            success: true,
            message: "Payment processed successfully.",
          });
        } catch (error) {
          console.error(
            `[webhook] Error processing webhook for transactionId ${transactionId}:`,
            error,
          );
          return Response.json(
            { message: "Internal server error processing webhook." },
            { status: 500 },
          );
        }
      },
    },
  },
});
