import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import {
  createPakasirTransaction,
  type PakasirPaymentMethod,
  BOOSTER_PACKS,
  type BoosterPackId,
} from "@/lib/pakasir";
import { prisma } from "@/lib/prisma";

export { BOOSTER_PACKS, type BoosterPackId };

export const Route = createFileRoute("/api/payment/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Unauthorized. Please log in to make a payment." },
            { status: 401 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          packageId?: string;
          method?: string;
        };

        const packageId = body.packageId as BoosterPackId;
        const pack = BOOSTER_PACKS[packageId];

        if (!pack) {
          return Response.json(
            { message: "Invalid package selection." },
            { status: 400 },
          );
        }

        const method = (body.method || "qris") as PakasirPaymentMethod;

        // Generate a unique order ID: INV-{userId-prefix}-{timestamp}
        const userPrefix = session.user.id.slice(-6).toUpperCase();
        const timestamp = Date.now();
        const orderId = `INV-${userPrefix}-${timestamp}`;

        try {
          // 1. Create transaction with Pakasir
          const paymentDetails = await createPakasirTransaction({
            orderId,
            amount: pack.amount,
            method,
          });

          // 2. Save payment record in DB with PENDING status
          const payment = await prisma.payment.create({
            data: {
              userId: session.user.id,
              orderId,
              amount: pack.amount,
              energyGranted: pack.energy,
              status: "PENDING",
              paymentMethod: method,
              paymentNumber: paymentDetails.payment_number,
              type: "ENERGY_BOOSTER",
              metadata: {
                packageName: pack.name,
                packageId,
              },
            },
          });

          return Response.json({
            success: true,
            orderId: payment.orderId,
            amount: payment.amount,
            paymentNumber: payment.paymentNumber,
            status: payment.status,
          });
        } catch (error) {
          console.error("[payment-create] Failed to create payment:", error);
          return Response.json(
            {
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to initiate payment.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
