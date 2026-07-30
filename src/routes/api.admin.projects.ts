import { createFileRoute } from "@tanstack/react-router";

import { listAdminProjects } from "@/lib/admin-projects";
import { requireAdmin } from "@/lib/auth-admin";

export const Route = createFileRoute("/api/admin/projects")({
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

        return Response.json(await listAdminProjects());
      },
    },
  },
});
