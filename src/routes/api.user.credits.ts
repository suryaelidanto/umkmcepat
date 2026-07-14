import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { getEnergyStats } from "@/lib/user-credits";

export const Route = createFileRoute("/api/user/credits")({
  server: {
    handlers: {
      GET: async () => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk melanjutkan." },
            { status: 401 },
          );
        }

        const stats = await getEnergyStats(session.user.id);

        return Response.json(stats);
      },
    },
  },
});
