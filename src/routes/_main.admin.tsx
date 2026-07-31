import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Toaster } from "sonner";

import { AdminTabs } from "@/components/admin/AdminTabs";
import { EfferdAppShell } from "@/components/admin/prototype/efferd/app-shell";
import { parseAdminVariant } from "@/components/admin/prototype/types";
import { useAdminVariant } from "@/components/admin/prototype/useAdminVariant";
import { PrototypeSwitcher } from "@/components/admin/PrototypeSwitcher";
import { StreamerModeProvider } from "@/components/admin/streamer-mode-context";
import { requireAdmin } from "@/lib/auth-admin";
import { isStreamerModeEnabled } from "@/lib/config";

// PROTOTYPE: ?variant=A (current) | B–E Efferd-inspired shells. Default A.

const loadAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await requireAdmin();
  if (!admin.ok) {
    throw redirect({ to: "/" });
  }
  return { ok: true as const };
});

const loadStreamerMode = createServerFn({ method: "GET" }).handler(async () => {
  return isStreamerModeEnabled();
});

export const Route = createFileRoute("/_main/admin")({
  validateSearch: (search: Record<string, unknown>) => ({
    variant: parseAdminVariant(search.variant),
  }),
  loader: async () => {
    await loadAdmin();
    const streamerMode = await loadStreamerMode();
    return { streamerMode };
  },
  component: AdminShell,
});

function AdminShell() {
  const { streamerMode } = Route.useLoaderData();
  const variant = useAdminVariant();

  return (
    <StreamerModeProvider value={streamerMode}>
      {variant === "A" ? (
        <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-spacing-4 pb-24 pt-spacing-4 text-surface-warm-white">
          <h1 className="mb-spacing-3 text-2xl font-semibold">Admin</h1>
          <AdminTabs />
          <div className="mt-spacing-4">
            <Outlet />
          </div>
        </main>
      ) : (
        <EfferdAppShell variant={variant}>
          <Outlet />
        </EfferdAppShell>
      )}
      <PrototypeSwitcher />
      <Toaster richColors position="top-center" />
    </StreamerModeProvider>
  );
}
