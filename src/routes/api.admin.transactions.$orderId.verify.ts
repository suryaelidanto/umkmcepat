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
          const payment = await prisma.payment.findUnique({
            where: { orderId: params.orderId },
            select: { amount: true, status: true, providerTxnId: true },
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
            const newStatus = detail.status.toUpperCase();
            await prisma.payment.update({
              where: { orderId: params.orderId },
              data: { status: newStatus },
            });
            return Response.json({ status: newStatus });
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
