import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth/auth";
import { reopenTicket } from "@/lib/support/service";
import { mapToUserFacingError } from "@/lib/user-facing-error";

export const Route = createFileRoute("/api/support/tickets/$ticketId/reopen")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        try {
          const result = await reopenTicket(
            params.ticketId,
            session.user.id,
            false,
          );
          return Response.json(result);
        } catch (error) {
          const raw = error instanceof Error ? error.message : "";
          console.error("[support] reopen ticket failed:", raw);
          return Response.json(
            { message: mapToUserFacingError(raw) },
            { status: 400 },
          );
        }
      },
    },
  },
});
