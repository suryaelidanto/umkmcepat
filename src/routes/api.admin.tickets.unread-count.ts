import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { getUnreadCounts } from "@/lib/support/service";

export const Route = createFileRoute("/api/admin/tickets/unread-count")({
  server: {
    handlers: {
      GET: async () => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }

        try {
          const counts = await getUnreadCounts({
            userId: admin.admin.userId,
            isAdmin: true,
          });
          return Response.json(counts);
        } catch {
          return Response.json(
            { message: "Gagal memuat jumlah tiket masuk." },
            { status: 500 },
          );
        }
      },
    },
  },
});
