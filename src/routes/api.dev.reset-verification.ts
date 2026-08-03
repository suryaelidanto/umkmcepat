import { createFileRoute } from "@tanstack/react-router";

import { requireDevAdmin } from "@/lib/dev-admin";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/dev/reset-verification")({
  server: {
    handlers: {
      POST: async () => {
        const gate = await requireDevAdmin();
        if (!gate.ok) {
          return Response.json(
            { message: gate.message },
            { status: gate.status },
          );
        }

        await prisma.user.update({
          where: { id: gate.admin.userId },
          data: { verifiedAt: null },
        });

        return Response.json({
          message: "Verifikasi di-reset (dev mode).",
        });
      },
    },
  },
});
