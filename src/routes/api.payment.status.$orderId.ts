import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

          return Response.json({
            success: true,
            orderId: payment.orderId,
            status: payment.status,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
            createdAt: payment.createdAt,
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
