import { createFileRoute } from "@tanstack/react-router";

// Empty leaf so /api/projects/$id/assets is no longer a layout boundary
// for the splat sibling. The real handler lives at /assets/upload.
export const Route = createFileRoute("/api/projects/$id/assets")({});
