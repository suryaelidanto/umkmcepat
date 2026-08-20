import { createFileRoute } from "@tanstack/react-router";

import { handleVisualEditPost } from "@/routes/api.projects.$id.visual-edit";

export const Route = createFileRoute("/api/projects/$id/edit")({
  server: {
    handlers: {
      POST: ({ request, params }) => handleVisualEditPost(request, params.id),
    },
  },
});
