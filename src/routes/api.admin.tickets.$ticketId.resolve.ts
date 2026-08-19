import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { sendTicketResolved } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";
import { resolveTicket } from "@/lib/support/service";
import { mapToUserFacingError } from "@/lib/user-facing-error";

export const Route = createFileRoute("/api/admin/tickets/$ticketId/resolve")({
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

        try {
          const result = await resolveTicket(
            params.ticketId,
            admin.admin.userId,
            true,
          );

          // Non-fatal email
          prisma.supportTicket
            .findUnique({
              where: { id: params.ticketId },
              select: { user: { select: { email: true } } },
            })
            .then((ticket) => {
              if (ticket?.user?.email) {
                sendTicketResolved(ticket.user.email, params.ticketId).catch(
                  () => undefined,
                );
              }
            })
            .catch(() => undefined);

          return Response.json(result);
        } catch (error) {
          const raw = error instanceof Error ? error.message : "";
          console.error("[admin][support] resolve failed:", raw);
          return Response.json(
            { message: mapToUserFacingError(raw) },
            { status: 400 },
          );
        }
      },
    },
  },
});
