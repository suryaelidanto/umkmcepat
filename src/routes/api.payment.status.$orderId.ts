import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { getMayarTransaction } from "@/lib/mayar";
import { prisma } from "@/lib/prisma";
import { logCreditTransaction } from "@/lib/user-credits";

// If a payment has been PENDING longer than this, the client is still
// polling but a webhook may never arrive (undocumented retry policy on
// Mayar's side) — reconcile directly against Mayar's API instead of waiting
// forever. Kept well above typical webhook latency to avoid burning through
// Mayar's 50 req/min rate limit on every poll tick.
const RECONCILE_AFTER_MS = 2 * 60 * 1000;

async function reconcilePendingPayment(payment: {
  orderId: string;
  amount: number;
  providerTxnId: string | null;
}) {
  if (!payment.providerTxnId) {
    return null;
  }

  const verified = await getMayarTransaction(payment.providerTxnId);

  if (verified.status !== "SUCCESS" || verified.amount !== payment.amount) {
    return null;
  }

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { orderId: payment.orderId, status: "PENDING" },
      data: {
        status: "COMPLETED",
        paymentMethod: verified.paymentMethod,
        updatedAt: new Date(),
      },
    });

    if (claimed.count !== 1) {
      return null;
    }

    const txPayment = await tx.payment.findUniqueOrThrow({
      where: { orderId: payment.orderId },
    });

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
      paymentMethod: verified.paymentMethod,
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
  }

  return result;
}

export const Route = createFileRoute("/api/payment/status/$orderId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json({ message: "Unauthorized." }, { status: 401 });
        }

        const { orderId } = params;

        if (!orderId) {
          return Response.json(
            { message: "Missing orderId parameter." },
            { status: 400 },
          );
        }

        try {
          const payment = await prisma.payment.findUnique({
            where: { orderId },
            select: {
              orderId: true,
              userId: true,
              amount: true,
              status: true,
              paymentMethod: true,
              providerTxnId: true,
              createdAt: true,
            },
          });

          if (!payment) {
            return Response.json(
              { message: "Payment not found." },
              { status: 404 },
            );
          }

          // Protect privacy: only the owner of the payment can read it
          if (payment.userId !== session.user.id) {
            return Response.json(
              { message: "Forbidden. You do not own this invoice." },
              { status: 403 },
            );
          }

          let status = payment.status;
          let paymentMethod = payment.paymentMethod;

          const isStalePending =
            status === "PENDING" &&
            Date.now() - payment.createdAt.getTime() > RECONCILE_AFTER_MS;

          if (isStalePending) {
            try {
              const reconciled = await reconcilePendingPayment(payment);
              if (reconciled) {
                status = "COMPLETED";
                paymentMethod = reconciled.paymentMethod;
              }
            } catch (error) {
              // Reconciliation failure shouldn't break status polling —
              // log and fall through to the last-known DB status.
              console.warn(
                `[payment-status] Reconciliation failed for ${orderId}:`,
                error,
              );
            }
          }

          return Response.json({
            success: true,
            orderId: payment.orderId,
            status,
            amount: payment.amount,
            paymentMethod,
          });
        } catch (error) {
          console.error(
            `[payment-status] Error fetching order status for ${orderId}:`,
            error,
          );
          return Response.json(
            { message: "Internal server error fetching status." },
            { status: 500 },
          );
        }
      },
    },
  },
});
