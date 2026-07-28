import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Toaster } from "sonner";

import { AdminTabs } from "@/components/admin/AdminTabs";
import { StreamerModeProvider } from "@/components/admin/streamer-mode-context";
import { requireAdmin } from "@/lib/auth-admin";
import { isStreamerModeEnabled } from "@/lib/config";

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
  loader: async () => {
    await loadAdmin();
    const streamerMode = await loadStreamerMode();
    return { streamerMode };
  },
  component: AdminShell,
});

function AdminShell() {
  const { streamerMode } = Route.useLoaderData();
  return (
    <StreamerModeProvider value={streamerMode}>
      <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-spacing-4 pb-24 pt-spacing-4 text-surface-warm-white">
        <h1 className="mb-spacing-3 text-2xl font-semibold">Admin</h1>
        <AdminTabs />
        <div className="mt-spacing-4">
          <Outlet />
        </div>
        <Toaster richColors position="top-center" />
      </main>
    </StreamerModeProvider>
  );
}
