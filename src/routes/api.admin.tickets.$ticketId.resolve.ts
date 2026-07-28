import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { resolveTicket } from "@/lib/support/service";

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
          return Response.json(result);
        } catch (error) {
          return Response.json(
            {
              message:
                error instanceof Error
                  ? error.message
                  : "Gagal menyelesaikan tiket.",
            },
            { status: 400 },
          );
        }
      },
    },
  },
});
