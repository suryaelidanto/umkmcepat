import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { devApproveOwnWaitlistEntry } from "@/lib/waitlist";

export const Route = createFileRoute("/api/dev/skip-waitlist")({
  server: {
    handlers: {
      POST: async () => {
        if (process.env.NODE_ENV !== "development") {
          return Response.json(
            { message: "Endpoint ini hanya tersedia di mode development." },
            { status: 403 },
          );
        }

        const session = await auth();
        if (!session?.user?.email) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        await devApproveOwnWaitlistEntry(session.user.email);

        return Response.json({
          message: "Pendaftaran di-skip (dev mode).",
        });
      },
    },
  },
});
