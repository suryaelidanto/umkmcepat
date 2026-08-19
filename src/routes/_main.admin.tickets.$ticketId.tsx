import { createFileRoute } from "@tanstack/react-router";

import { TicketThreadView } from "@/components/support/TicketThreadView";

export const Route = createFileRoute("/_main/admin/tickets/$ticketId")({
  component: AdminTicketThreadRoute,
});

function AdminTicketThreadRoute() {
  const { ticketId } = Route.useParams();

  return (
    <TicketThreadView
      ticketId={ticketId}
      isAdmin={true}
      backUrl="/admin/tickets"
    />
  );
}
