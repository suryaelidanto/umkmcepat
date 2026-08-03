import { createFileRoute } from "@tanstack/react-router";

import { requireDevAdmin } from "@/lib/dev-admin";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/dev/skip-verification")({
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

        await prisma.user.upsert({
          where: { id: gate.admin.userId },
          update: { verifiedAt: new Date() },
          create: {
            id: gate.admin.userId,
            email: gate.admin.email,
            name: "",
            verifiedAt: new Date(),
          },
        });

        return Response.json({
          message: "Verifikasi berhasil (dev mode).",
        });
      },
    },
  },
});
