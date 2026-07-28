import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import { getUnreadCounts } from "@/lib/support/service";

export const Route = createFileRoute("/api/support/unread-count")({
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

        try {
          const counts = await getUnreadCounts({
            userId: session.user.id,
            isAdmin: false,
          });
          return Response.json(counts);
        } catch {
          return Response.json(
            { message: "Gagal memuat jumlah tiket belum terbaca." },
            { status: 500 },
          );
        }
      },
    },
  },
});
