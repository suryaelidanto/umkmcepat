import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import {
  isDevUnlimitedEnergyEnabled,
  setDevUnlimitedEnergy,
} from "@/lib/user-credits";

// Dev-only: manually toggle the energy-bypass override. Only available when
// NODE_ENV=development — production always deducts energy for real.
export const Route = createFileRoute("/api/dev/unlimited-energy")({
  server: {
    handlers: {
      GET: async () => {
        if (process.env.NODE_ENV !== "development") {
          return Response.json(
            { message: "Hanya tersedia di development." },
            { status: 403 },
          );
        }

        return Response.json({ enabled: isDevUnlimitedEnergyEnabled() });
      },
      POST: async ({ request }) => {
        if (process.env.NODE_ENV !== "development") {
          return Response.json(
            { message: "Hanya tersedia di development." },
            { status: 403 },
          );
        }

        const session = await auth();
        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          enabled?: unknown;
        };
        setDevUnlimitedEnergy(
          typeof body.enabled === "boolean"
            ? body.enabled
            : !isDevUnlimitedEnergyEnabled(),
        );

        return Response.json({ enabled: isDevUnlimitedEnergyEnabled() });
      },
    },
  },
});
