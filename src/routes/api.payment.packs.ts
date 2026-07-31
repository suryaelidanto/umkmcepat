import { createFileRoute } from "@tanstack/react-router";

import { auth, requireNotBanned } from "@/lib/auth";
import { listBoosterPacks } from "@/lib/mayar";

export const Route = createFileRoute("/api/payment/packs")({
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

        await requireNotBanned(session);

        const packs = await listBoosterPacks();
        return Response.json({ packs });
      },
    },
  },
});
