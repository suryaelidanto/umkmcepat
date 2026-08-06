import { createFileRoute } from "@tanstack/react-router";

import { getPublicFlags } from "@/lib/feature-flags";

export const Route = createFileRoute("/api/flags")({
  server: {
    handlers: {
      GET: async () => {
        const flags = await getPublicFlags();
        return Response.json(flags, {
          headers: { "Cache-Control": "no-store, must-revalidate" },
        });
      },
    },
  },
});
