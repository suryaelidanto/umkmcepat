import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/dev/skip-verification")({
  server: {
    handlers: {
      POST: async () => {
        if (process.env.NODE_ENV !== "development") {
          return Response.json(
            { message: "Endpoint ini hanya tersedia di mode development." },
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

        await prisma.user.update({
          where: { id: session.user.id },
          data: { verifiedAt: new Date() },
        });

        return Response.json({
          message: "Verifikasi berhasil (dev mode).",
        });
      },
    },
  },
});
