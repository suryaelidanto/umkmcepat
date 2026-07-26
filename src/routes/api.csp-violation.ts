import { createFileRoute } from "@tanstack/react-router";

import { devLog } from "@/lib/dev-log";

export const Route = createFileRoute("/api/csp-violation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;

          devLog("csp-violation", "received", body);

          return Response.json({ received: true }, { status: 200 });
        } catch (error) {
          console.error("[csp-violation] failed to parse body:", error);
          return Response.json(
            { error: "Invalid violation payload." },
            { status: 400 },
          );
        }
      },
    },
  },
});
