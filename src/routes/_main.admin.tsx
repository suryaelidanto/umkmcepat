import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { requireAdmin } from "@/lib/auth-admin";
import { fetchJson } from "@/lib/query-client";
import { listPendingWaitlist } from "@/lib/waitlist";

type PendingEntry = {
  businessName: string;
  businessType: string | null;
  id: string;
  imageRef: string | null;
  phone: string | null;
  status: string;
  story: string;
  submittedAt: string;
};

const loadAdminWaitlist = createServerFn({ method: "GET" }).handler(
  async () => {
    const admin = await requireAdmin();
    if (!admin.ok) {
      throw redirect({ to: "/" });
    }
    const entries = await listPendingWaitlist();
    return {
      entries: entries.map((entry) => ({
        businessName: entry.businessName,
        businessType: entry.businessType,
        id: entry.id,
        imageRef: entry.imageRef,
        phone: entry.phone,
        status: entry.status,
        story: entry.story,
        submittedAt: entry.submittedAt.toISOString(),
      })),
    };
  },
);

export const Route = createFileRoute("/_main/admin")({
  loader: () => loadAdminWaitlist(),
  component: AdminPage,
});

function AdminPage() {
  const queryClient = useQueryClient();
  const initial = Route.useLoaderData() as unknown as {
    entries: PendingEntry[];
  };
  const { data } = useQuery({
    queryFn: () =>
      fetchJson<{ entries: PendingEntry[] }>("/api/admin/waitlist"),
    queryKey: ["admin", "waitlist"],
    initialData: { entries: initial.entries },
  });

  const act = useMutation({
    mutationFn: async (vars: {
      action: "approve" | "reject";
      entryId: string;
      reason?: string;
    }) =>
      fetchJson("/api/admin/waitlist", {
        body: JSON.stringify(vars),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "waitlist"] }),
  });

  async function decide(action: "approve" | "reject", entryId: string) {
    const reason =
      action === "reject"
        ? (window.prompt("Alasan penolakan (opsional)?") ?? "")
        : "";
    try {
      await act.mutateAsync({ action, entryId, reason });
    } catch {
      window.alert("Gagal memproses. Coba lagi.");
    }
  }

  const entries = data?.entries ?? [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-spacing-4 px-spacing-4 pb-24 pt-spacing-6">
      <h1 className="text-2xl font-semibold">Antrean pendaftar</h1>
      {entries.length === 0 ? (
        <p className="text-surface-warm-white/60">
          Belum ada pendaftar menunggu.
        </p>
      ) : (
        <ul className="flex flex-col gap-spacing-3">
          {entries.map((entry) => (
            <li
              className="rounded-radius-lg border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-4"
              key={entry.id}
            >
              <div className="flex items-start justify-between gap-spacing-3">
                <div>
                  <p className="font-medium">{entry.businessName}</p>
                  {entry.businessType ? (
                    <p className="text-sm text-surface-warm-white/60">
                      {entry.businessType}
                    </p>
                  ) : null}
                  {entry.phone ? (
                    <p className="text-sm text-surface-warm-white/60">
                      {entry.phone}
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="mt-spacing-2 line-clamp-4 text-sm text-surface-warm-white/80">
                {entry.story}
              </p>
              <div className="mt-spacing-3 flex gap-spacing-2">
                <button
                  className="rounded-radius-md bg-emerald-600 px-spacing-3 py-spacing-2 text-sm text-white"
                  onClick={() => decide("approve", entry.id)}
                  type="button"
                >
                  Setujui
                </button>
                <button
                  className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm"
                  onClick={() => decide("reject", entry.id)}
                  type="button"
                >
                  Tolak
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
