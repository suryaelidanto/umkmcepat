import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { resolveTicket } from "@/lib/support/service";
import { mapToUserFacingError } from "@/lib/user-facing-error";

export const Route = createFileRoute("/api/support/tickets/$ticketId/resolve")({
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
          const result = await resolveTicket(
            params.ticketId,
            session.user.id,
            false,
          );
          return Response.json(result);
        } catch (error) {
          const raw = error instanceof Error ? error.message : "";
          console.error("[support] resolve ticket failed:", raw);
          return Response.json(
            { message: mapToUserFacingError(raw) },
            { status: 400 },
          );
        }
      },
    },
  },
});
