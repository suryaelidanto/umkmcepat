import { createFileRoute } from "@tanstack/react-router";

import {
  chargeModerationEnergy,
  moderateProjectRequest,
} from "@/lib/ai/ai-moderation";
import { auth } from "@/lib/auth/auth";
import { checkEnergy, getEnergyConfig } from "@/lib/payment/user-credits";
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
          const session = await auth();
          if (session?.user?.id) {
            const energy = await checkEnergy(
              session.user.id,
              getEnergyConfig().minModeration,
            );
            if (!energy.allowed) {
              return Response.json(
                {
                  allowed: false,
                  message:
                    "Energi kamu sudah habis. Tambah energi untuk lanjut.",
                  code: "energy_exhausted",
                  remaining: energy.remaining,
                },
                { status: 429 },
              );
            }
          }

          const result = await moderateProjectRequest(validation.value);
          await chargeModerationEnergy(session?.user?.id, result);
          return Response.json({
            allowed: result.allowed,
            message: "message" in result ? result.message : undefined,
          });
        } catch (error) {
          console.error("[moderation] api.moderation.project-request failed", {
            error: error instanceof Error ? error.message : error,
          });
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
