import { createFileRoute } from "@tanstack/react-router";

import { listNineRouterModels } from "@/lib/ai/nine-router-models";
import { requireAdmin } from "@/lib/auth/auth-admin";

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
