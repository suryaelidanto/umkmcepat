import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeProfileName } from "@/lib/profile";

export const Route = createFileRoute("/api/profile")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const session = await auth();

        if (!session?.user?.id) {
          return Response.json(
            { message: "Masuk dulu untuk mengubah profil." },
            { status: 401 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          name?: unknown;
        };
        const name = normalizeProfileName(body.name);

        if (!name) {
          return Response.json(
            { message: "Nama tidak boleh kosong." },
            { status: 400 },
          );
        }

        const data: { name: string } = { name };

        const user = await prisma.user.update({
          where: { id: session.user.id },
          data,
          select: { name: true },
        });

        return Response.json({
          user: { name: user.name },
        });
      },
    },
  },
});
