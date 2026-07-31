import { createFileRoute } from "@tanstack/react-router";

import {
  listAdminProjects,
  parseAdminProjectFilter,
} from "@/lib/admin-projects";
import { requireAdmin } from "@/lib/auth-admin";

export const Route = createFileRoute("/api/admin/projects")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireAdmin();
        if (!admin.ok) {
          return Response.json(
            { message: admin.message },
            { status: admin.status },
          );
        }

        const filter = parseAdminProjectFilter(
          new URL(request.url).searchParams.get("status"),
        );
        return Response.json(await listAdminProjects(undefined, filter));
      },
    },
  },
});
