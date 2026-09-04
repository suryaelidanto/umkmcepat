import { createFileRoute } from "@tanstack/react-router";

import { handleVisualEditPost } from "@/lib/projects/visual-edit-handler";

export const Route = createFileRoute("/api/projects/$id/visual-edit")({
  server: {
    handlers: {
      POST: ({ request, params }) => handleVisualEditPost(request, params.id),
    },
  },
});

export { handleVisualEditPost };
