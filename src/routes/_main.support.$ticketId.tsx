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
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-3 pb-20 pt-6 text-[#1c1c1c] transition-colors duration-200 dark:text-surface-warm-white sm:px-6 lg:px-8">
      <TicketThreadView
        ticketId={ticketId}
        isAdmin={false}
        backUrl="/support"
      />
    </main>
  );
}
