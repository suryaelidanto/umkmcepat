import { createFileRoute } from "@tanstack/react-router";

import { moderateProjectRequest } from "@/lib/ai-moderation";
import { auth } from "@/lib/auth";
import { validateProjectRequest } from "@/lib/projects/input";
import { checkRateLimit } from "@/lib/rate-limit";

export const Route = createFileRoute("/api/projects/moderate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { allowed: false, message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const rateLimitResponse = await checkRateLimit(request, "ai");

        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        const { prompt } = (await request.json()) as { prompt?: string };
        const validation = validateProjectRequest(prompt ?? "");

        if (!validation.ok) {
          return Response.json(
            { allowed: false, message: validation.message },
            { status: 400 },
          );
        }

        try {
          const result = await moderateProjectRequest(validation.value);
          return Response.json(result, { status: 200 });
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
