import { createFileRoute } from "@tanstack/react-router";

import { requireDevAdmin } from "@/lib/admin/dev-admin";
import { devResetOwnWaitlistEntry } from "@/lib/waitlist/waitlist";

export const Route = createFileRoute("/api/dev/reset-waitlist")({
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

        await devResetOwnWaitlistEntry(gate.admin.email);

        return Response.json({
          message: "Pendaftaran di-reset (dev mode).",
        });
      },
    },
  },
});
