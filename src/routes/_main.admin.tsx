import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Toaster } from "sonner";

import { AdminTabs } from "@/components/admin/AdminTabs";
import { requireAdmin } from "@/lib/auth-admin";

const loadAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await requireAdmin();
  if (!admin.ok) {
    throw redirect({ to: "/" });
  }
  return { ok: true };
});

export const Route = createFileRoute("/_main/admin")({
  loader: () => loadAdmin(),
  component: AdminShell,
});

function AdminShell() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-spacing-4 pb-24 pt-spacing-4 text-surface-warm-white">
      <h1 className="mb-spacing-3 text-2xl font-semibold">Admin</h1>
      <AdminTabs />
      <div className="mt-spacing-4">
        <Outlet />
      </div>
      <Toaster richColors position="top-center" />
    </main>
  );
}
