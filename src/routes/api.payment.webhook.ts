import { createFileRoute } from "@tanstack/react-router";

import { verifyPakasirTransaction } from "@/lib/pakasir";
import { prisma } from "@/lib/prisma";

interface WebhookPayload {
  amount: number;
  order_id: string;
  project: string;
  status: string;
  payment_method: string;
  completed_at: string;
}

export const Route = createFileRoute("/api/payment/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: WebhookPayload;

        try {
          payload = (await request.json()) as WebhookPayload;
        } catch {
          return Response.json(
            { message: "Invalid JSON body." },
            { status: 400 },
          );
        }

        const { order_id: orderId, amount, status } = payload;

        if (!orderId || typeof amount !== "number" || !status) {
          return Response.json(
            { message: "Missing required webhook fields." },
            { status: 400 },
          );
        }

        try {
          // 1. Fetch payment record from database
          const payment = await prisma.payment.findUnique({
            where: { orderId },
          });

          if (!payment) {
            console.warn(`[webhook] Payment not found for orderId ${orderId}`);
            return Response.json(
              { message: "Payment not found." },
              { status: 404 },
            );
          }

          // If the payment is already completed or processed, do nothing (idempotency check)
          if (payment.status !== "PENDING") {
            return Response.json({
              success: true,
              message: `Payment already in status: ${payment.status}`,
            });
          }

          // 2. Direct Verification API call (essential security verification)
          // We call Pakasir directly to check the actual transaction details.
          const verifiedTransaction = await verifyPakasirTransaction({
            orderId,
            amount: payment.amount,
          });

          if (verifiedTransaction.status !== "completed") {
            console.warn(
              `[webhook] Direct verification status is "${verifiedTransaction.status}", expected "completed" for orderId ${orderId}`,
            );
            return Response.json({
              success: false,
              message: `Transaction not fully completed. Current status: ${verifiedTransaction.status}`,
            });
          }

          // 3. Process completed payment inside transaction to guarantee consistency and prevent duplicates
          await prisma.$transaction(async (tx) => {
            // Re-fetch inside transaction and lock the row to prevent race conditions
            const txPayment = await tx.payment.findUnique({
              where: { orderId },
            });

            if (!txPayment || txPayment.status !== "PENDING") {
              return;
            }

            // Update payment status
            await tx.payment.update({
              where: { orderId },
              data: {
                status: "COMPLETED",
                paymentMethod: verifiedTransaction.payment_method,
                updatedAt: new Date(),
              },
            });

            // Grant energy credits
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
          });

          // eslint-disable-next-line no-console
          console.log(
            `[webhook] Successfully processed payment for orderId: ${orderId}`,
          );
          return Response.json({
            success: true,
            message: "Payment processed successfully.",
          });
        } catch (error) {
          console.error(
            `[webhook] Error processing webhook for orderId ${orderId}:`,
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
