import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Toaster } from "sonner";

import { AdminShell } from "@/components/admin/navigation/AdminShell";
import { StreamerModeProvider } from "@/components/admin/streamer-mode/streamer-mode-context";
import { loadStreamerMode } from "@/lib/admin/admin-streamer-mode";
import { requireAdmin } from "@/lib/auth/auth-admin";

const loadAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await requireAdmin();
  if (!admin.ok) {
    throw redirect({ to: "/" });
  }
  return { ok: true as const };
});

export const Route = createFileRoute("/_main/admin")({
  loader: async () => {
    await loadAdmin();
    const streamerMode = await loadStreamerMode();
    return { streamerMode };
  },
  component: AdminRoute,
});

function AdminRoute() {
  const { streamerMode } = Route.useLoaderData();
  return (
    <StreamerModeProvider initialData={streamerMode}>
      <AdminShell>
        <Outlet />
      </AdminShell>
      <Toaster richColors position="top-center" />
    </StreamerModeProvider>
  );
}
