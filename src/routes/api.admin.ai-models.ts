import { createFileRoute } from "@tanstack/react-router";

import { requireAdmin } from "@/lib/auth-admin";
import { listNineRouterModels } from "@/lib/nine-router-models";

export const Route = createFileRoute("/api/admin/ai-models")({
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
        const models = await listNineRouterModels();
        return Response.json({ models });
      },
    },
  },
});
