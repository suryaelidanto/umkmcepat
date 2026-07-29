import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import {
  createMayarPayment,
  getBoosterPack,
  type BoosterPackId,
  BOOSTER_PACKS,
} from "@/lib/mayar";
import { prisma } from "@/lib/prisma";
import { mapToUserFacingError } from "@/lib/user-facing-error";

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
        };

        const packageId = body.packageId as BoosterPackId;
        const fallbackPack = BOOSTER_PACKS[packageId];
        if (!fallbackPack) {
          return Response.json(
            { message: "Invalid package selection." },
            { status: 400 },
          );
        }
        const pack = await getBoosterPack(packageId);

        // Generate a unique order ID: INV-{userId-prefix}-{timestamp}
        const userPrefix = session.user.id.slice(-6).toUpperCase();
        const timestamp = Date.now();
        const orderId = `INV-${userPrefix}-${timestamp}`;

        // Fetch user details needed for Mayar invoice creation
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: session.user.id },
          select: { name: true, email: true, phone: true },
        });

        try {
          // 1. Create an invoice with Mayar (single-use, carries transactionId for webhook correlation)
          const mayarPayment = await createMayarPayment({
            orderId,
            amount: pack.amount,
            packName: pack.name,
            expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            customerName: user.name ?? "Customer",
            customerEmail: user.email ?? "",
            customerMobile: user.phone ?? "081000000000",
          });

          // 2. Save payment record in DB with PENDING status
          const payment = await prisma.payment.create({
            data: {
              userId: session.user.id,
              orderId,
              amount: pack.amount,
              energyGranted: pack.energy,
              status: "PENDING",
              providerTxnId: mayarPayment.transactionId,
              providerPaymentLinkId: mayarPayment.id,
              paymentUrl: mayarPayment.link,
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
            paymentUrl: payment.paymentUrl,
            status: payment.status,
          });
        } catch (error) {
          console.error("[payment-create] Failed to create payment:", error);
          return Response.json(
            {
              message: mapToUserFacingError(
                error instanceof Error ? error.message : "",
              ),
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
