import { createFileRoute } from "@tanstack/react-router";

import { moderateProjectRequest } from "@/lib/ai-moderation";
import { validateProjectRequest } from "@/lib/projects/input";
import { checkRateLimit } from "@/lib/rate-limit";

type ModerationBody = { prompt?: string };

export const Route = createFileRoute("/api/moderation/project-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rateLimitResponse = await checkRateLimit(request, "global");

        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        const body = (await request.json().catch(() => ({}))) as ModerationBody;
        const validation = validateProjectRequest(body.prompt ?? "");

        if (!validation.ok) {
          return Response.json(
            { allowed: false, message: validation.message },
            { status: 400 },
          );
        }

        try {
          return Response.json(await moderateProjectRequest(validation.value));
        } catch {
          return Response.json(
            {
              allowed: false,
              code: "moderation_unavailable",
              message:
                "Checker keamanan lagi lambat. Coba kirim lagi sebentar ya.",
            },
            { status: 503, headers: { "Retry-After": "3" } },
          );
        }
      },
    },
  },
});
