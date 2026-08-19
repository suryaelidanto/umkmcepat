import { createFileRoute } from "@tanstack/react-router";

import {
  listAdminProjects,
  parseAdminProjectFilter,
} from "@/lib/admin/admin-projects";
import { requireAdmin } from "@/lib/auth/auth-admin";

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

        const url = new URL(request.url);
        const filter = parseAdminProjectFilter(url.searchParams.get("status"));
        const q = url.searchParams.get("q") ?? undefined;
        return Response.json(await listAdminProjects(undefined, filter, q));
      },
    },
  },
});
