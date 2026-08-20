import { createFileRoute } from "@tanstack/react-router";

// Empty leaf so /api/projects/$id/assets is no longer a layout boundary
export const Route = createFileRoute("/api/projects/$id/assets")({});
