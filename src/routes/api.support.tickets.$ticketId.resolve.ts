import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { resolveTicket } from "@/lib/support/service";

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
