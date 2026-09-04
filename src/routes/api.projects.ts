import { createFileRoute } from "@tanstack/react-router";

import {
  handleCreateProject,
  handleGetProjects,
} from "@/lib/projects/api-projects-handler";

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: ({ request }) => handleGetProjects(request),
      POST: ({ request }) => handleCreateProject(request),
    },
  },
});
