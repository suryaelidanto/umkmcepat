import { createFileRoute } from "@tanstack/react-router";

import { requireDevAdmin } from "@/lib/dev-admin";
import { devApproveOwnWaitlistEntry } from "@/lib/waitlist";

export const Route = createFileRoute("/api/dev/skip-waitlist")({
  server: {
    handlers: {
      POST: async () => {
        const gate = await requireDevAdmin();
        if (!gate.ok) {
          return Response.json(
            { message: gate.message },
            { status: gate.status },
          );
        }

        await devApproveOwnWaitlistEntry(gate.admin.email);

        return Response.json({
          message: "Pendaftaran di-skip (dev mode).",
        });
      },
    },
  },
});
