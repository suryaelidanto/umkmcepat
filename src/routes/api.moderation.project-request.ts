import { createFileRoute } from "@tanstack/react-router";

import { moderateProjectRequest } from "@/lib/ai-moderation";
import { auth } from "@/lib/auth";
import { validateProjectRequest } from "@/lib/projects/input";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  chargeEnergyForAiUsage,
  checkEnergy,
  MIN_ENERGY_MODERATION,
} from "@/lib/user-credits";

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
          const session = await auth();
          if (session?.user?.id) {
            const energy = await checkEnergy(
              session.user.id,
              MIN_ENERGY_MODERATION,
            );
            if (!energy.allowed) {
              return Response.json(
                {
                  allowed: false,
                  message: "Energi harian habis. Coba lagi besok.",
                  code: "energy_exhausted",
                  remaining: energy.remaining,
                },
                { status: 429 },
              );
            }
          }

          const result = await moderateProjectRequest(validation.value);
          if (session?.user?.id && result.usage) {
            await chargeEnergyForAiUsage({
              userId: session.user.id,
              modelId: result.modelId || "umkmcepat-combo",
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              reason: "moderation",
            });
          }
          return Response.json({
            allowed: result.allowed,
            message: "message" in result ? result.message : undefined,
          });
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
