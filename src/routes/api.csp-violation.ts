import { createFileRoute } from "@tanstack/react-router";

import { devLog } from "@/lib/dev-log";

export const Route = createFileRoute("/api/csp-violation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentLengthHeader = request.headers.get("content-length");
          if (contentLengthHeader) {
            const limit = 51200; // 50 KB
            const length = parseInt(contentLengthHeader, 10);
            if (isNaN(length) || length > limit) {
              return Response.json(
                { error: "Payload too large." },
                { status: 413 },
              );
            }
          }

          const body = (await request.json()) as Record<string, unknown>;
          if (
            body === null ||
            typeof body !== "object" ||
            Array.isArray(body)
          ) {
            throw new Error("Invalid JSON structure");
          }

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
