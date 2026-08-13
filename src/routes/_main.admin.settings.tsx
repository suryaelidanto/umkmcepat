import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/admin/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_main/admin/settings"!</div>;
}
