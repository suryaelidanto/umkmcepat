import { createFileRoute } from "@tanstack/react-router";

import { assertDatabaseReady } from "@/lib/readiness";

export const Route = createFileRoute("/api/health/ready")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await assertDatabaseReady();

          return Response.json(
            { checks: { database: "ok" }, status: "ready" },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch {
          return Response.json(
            { checks: { database: "unavailable" }, status: "not_ready" },
            {
              status: 503,
              headers: { "Cache-Control": "no-store", "Retry-After": "3" },
            },
          );
        }
      },
    },
  },
});
