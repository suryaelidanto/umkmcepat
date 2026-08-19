import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { TicketThreadView } from "@/components/support/TicketThreadView";
import { auth } from "@/lib/auth/auth";

const requireAuth = createServerFn({ method: "GET" }).handler(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    throw redirect({ to: "/" });
  }
  return { ok: true };
});

export const Route = createFileRoute("/_main/support/$ticketId")({
  beforeLoad: async () => {
    await requireAuth();
  },
  component: UserTicketThreadRoute,
});

function UserTicketThreadRoute() {
  const { ticketId } = Route.useParams();

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-3.75rem)] w-full max-w-7xl flex-col overflow-hidden px-3 sm:px-6 lg:px-8 pb-3 text-[#1c1c1c] transition-colors duration-200 dark:text-surface-warm-white">
      <TicketThreadView
        ticketId={ticketId}
        isAdmin={false}
        backUrl="/support"
      />
    </div>
  );
}
