import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute("/api/admin/users/$id")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }
        const action = new URL(request.url).searchParams.get("action");
        const id = params.id;
        if (action === "ban") {
          await prisma.user.update({
            where: { id },
            data: { bannedAt: new Date() },
          });
          return Response.json({ status: "banned" });
        }
        if (action === "unban") {
          await prisma.user.update({
            where: { id },
            data: { bannedAt: null },
          });
          return Response.json({ status: "unbanned" });
        }
        return Response.json(
          { message: "action harus ban atau unban." },
          { status: 400 },
        );
      },
    },
  },
});
