import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { isStreamerModeEnabled } from "@/lib/config";

export const Route = createFileRoute("/api/admin/streamer-mode")({
  server: {
    handlers: {
      GET: async () => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        return Response.json({ enabled: await isStreamerModeEnabled() });
      },
    },
  },
});
