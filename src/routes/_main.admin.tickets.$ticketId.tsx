import { createFileRoute } from "@tanstack/react-router";

import { TicketThreadView } from "@/components/support/TicketThreadView";

export const Route = createFileRoute("/_main/admin/tickets/$ticketId")({
  component: AdminTicketThreadRoute,
});

function AdminTicketThreadRoute() {
  const { ticketId } = Route.useParams();

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] sm:h-[calc(100dvh-8rem)] w-full flex-col overflow-hidden text-[#1c1c1c] transition-colors duration-200 dark:text-surface-warm-white">
      <TicketThreadView
        ticketId={ticketId}
        isAdmin={true}
        backUrl="/admin/tickets"
      />
    </div>
  );
}
