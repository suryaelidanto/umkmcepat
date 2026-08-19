import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/admin/users")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_main/admin/users"!</div>;
}
