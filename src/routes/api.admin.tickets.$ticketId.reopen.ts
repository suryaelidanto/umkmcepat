import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth/auth-admin";
import { reopenTicket } from "@/lib/support/service";
import { mapToUserFacingError } from "@/lib/user-facing-error";

export const Route = createFileRoute("/api/admin/tickets/$ticketId/reopen")({
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
          const result = await reopenTicket(
            params.ticketId,
            admin.admin.userId,
          );

          return Response.json(result);
        } catch (error) {
          const raw = error instanceof Error ? error.message : "";
          console.error("[admin][support] reopen failed:", raw);
          return Response.json(
            { message: mapToUserFacingError(raw) },
            { status: 400 },
          );
        }
      },
    },
  },
});
