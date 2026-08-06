import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";
import { sendSupportReplyEmail } from "@/lib/support/email";
import { addMessage } from "@/lib/support/service";
import { mapToUserFacingError } from "@/lib/user-facing-error";

export const Route = createFileRoute("/api/admin/tickets/$ticketId/reply")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }

        const ticket = await prisma.supportTicket.findUnique({
          where: { id: params.ticketId },
          include: {
            user: {
              select: {
                email: true,
              },
            },
          },
        });

        if (!ticket) {
          return Response.json(
            { message: "Tiket tidak ditemukan." },
            { status: 404 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          body?: string;
          assetIds?: string[];
        };

        if (!body.body) {
          return Response.json(
            { message: "Pesan wajib diisi." },
            { status: 400 },
          );
        }

        try {
          // Check previous message role before inserting new reply
          const lastMessage = await prisma.supportMessage.findFirst({
            where: { ticketId: params.ticketId },
            orderBy: { createdAt: "desc" },
          });

          // Insert reply
          const result = await addMessage({
            ticketId: params.ticketId,
            authorId: admin.admin.userId,
            authorRole: "admin",
            body: body.body,
            assetIds: body.assetIds,
          });

          // Trigger email if the previous message was from user OR there was no previous message
          const shouldEmail = !lastMessage || lastMessage.authorRole === "user";
          if (shouldEmail && ticket.user.email) {
            await sendSupportReplyEmail({
              toEmail: ticket.user.email,
              ticketId: ticket.id,
              subject: ticket.subject,
              replyBody: body.body,
            }).catch((err) => {
              console.error(
                "[support-email] Failed to send email notification (non-fatal):",
                err,
              );
            });
          }

          return Response.json(result, { status: 201 });
        } catch (error) {
          const raw = error instanceof Error ? error.message : "";
          console.error("[admin][support] reply failed:", raw);
          return Response.json(
            { message: mapToUserFacingError(raw) },
            { status: 400 },
          );
        }
      },
    },
  },
});
