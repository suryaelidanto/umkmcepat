import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/admin/")({
  component: () => <p className="text-surface-warm-white/60">Memuat…</p>,
});
