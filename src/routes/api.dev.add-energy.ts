import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDayBoundaries } from "@/lib/user-credits";

// Dev-only: reset today's energy for the current user by deleting their
// negative credit records for the day. Only available when NODE_ENV=development.
export const Route = createFileRoute("/api/dev/add-energy")({
  server: {
    handlers: {
      POST: async () => {
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

        const { startOfDay, endOfDay } = getDayBoundaries();

        const deleted = await prisma.userCredit.deleteMany({
          where: {
            userId: session.user.id,
            createdAt: { gte: startOfDay, lt: endOfDay },
            amount: { lt: 0 },
          },
        });

        return Response.json({
          ok: true,
          deleted: deleted.count,
          message: `Energy di-reset (${deleted.count} record dihapus).`,
        });
      },
    },
  },
});
