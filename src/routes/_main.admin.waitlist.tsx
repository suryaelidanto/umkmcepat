import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { waitlistStatusDisplay } from "@/components/admin/status/admin-status";
import { AdminStatusBadge } from "@/components/admin/status/AdminStatusBadge";
import { AdminStatusFilter } from "@/components/admin/status/AdminStatusFilter";
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
import { requireAdmin } from "@/lib/auth/auth-admin";
import {
  ADMIN_WAITLIST_POLL_MS,
  fetchJson,
  invalidateAdminWaitlistData,
  queryKeys,
} from "@/lib/query-client";
import { listPendingWaitlist } from "@/lib/waitlist/waitlist";

type WaitlistStatusFilter = "pending" | "approved" | "rejected" | "all";

type AdminEntry = {
  businessName: string;
  businessType: string | null;
  email: string;
  id: string;
  imageCount: number;
  phone: string | null;
  rejectionReason: string | null;
  status: string;
  story: string;
  submittedAt: string;
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Menunggu" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
  { value: "all", label: "Semua" },
] as const;

function isPending(status: string) {
  return status === "pending" || status === "waitlisted";
}

const loadAdminWaitlist = createServerFn({ method: "GET" }).handler(
  async () => {
    const admin = await requireAdmin();
    if (!admin.ok) {
      throw redirect({ to: "/" });
    }
    // Default queue: pending work only.
    const entries = await listPendingWaitlist("pending");
    return {
      entries: entries.map((entry) => ({
        businessName: entry.businessName,
        businessType: entry.businessType,
        email: entry.email,
        id: entry.id,
        imageCount: entry.imageCount,
        phone: entry.phone,
        rejectionReason: entry.rejectionReason,
        status: entry.status,
        story: entry.story,
        submittedAt: entry.submittedAt.toISOString(),
      })),
    };
  },
);

export const Route = createFileRoute("/_main/admin/waitlist")({
  loader: () => loadAdminWaitlist(),
  component: WaitlistPage,
});

function WaitlistPage() {
  const streamerMode = useStreamerMode();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<WaitlistStatusFilter>("pending");
  const [q, setQ] = useState("");
  const initial = Route.useLoaderData() as unknown as {
    entries: AdminEntry[];
  };

  const { data } = useQuery({
    queryFn: () =>
      fetchJson<{ entries: AdminEntry[] }>(
        `/api/admin/waitlist?status=${status}&q=${encodeURIComponent(q)}`,
      ),
    queryKey: [...queryKeys.adminWaitlist, status, q],
    initialData:
      status === "pending" && !q ? { entries: initial.entries } : undefined,
    refetchInterval: ADMIN_WAITLIST_POLL_MS,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
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
    onSuccess: async (_data, vars) => {
      await invalidateAdminWaitlistData(queryClient);
      toast.success(vars.action === "approve" ? "Disetujui." : "Ditolak.");
    },
    onError: () => toast.error("Gagal memproses. Coba lagi."),
  });

  const entries = data?.entries ?? [];

  return (
    <div className="flex flex-col gap-spacing-4">
      <AdminStatusFilter
        onChange={(v) => setStatus(v as WaitlistStatusFilter)}
        options={STATUS_OPTIONS}
        value={status}
      />
      <AdminSearchInput
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari nama usaha, email, atau cerita…"
        value={q}
      />

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-radius-lg border border-dashed border-black/10 py-spacing-12 text-center text-[#5f5f5d] dark:border-surface-warm-white/10 dark:text-surface-warm-white/40">
          <ClipboardList className="size-8 opacity-40" />
          <p className="mt-spacing-3 text-sm">
            {status === "pending"
              ? "Belum ada pendaftar menunggu."
              : q
                ? "Tidak ada pendaftar yang cocok dengan pencarian."
                : "Tidak ada data pendaftar."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-spacing-3">
          <div className="flex items-center justify-between px-1 text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
            <span>Menampilkan {entries.length} pendaftar</span>
          </div>
          {entries.map((entry) => {
            const status = waitlistStatusDisplay(entry.status);
            const rowActionPending =
              act.isPending && act.variables?.entryId === entry.id;
            const approving =
              rowActionPending && act.variables?.action === "approve";
            return (
              <div
                className="rounded-radius-lg border border-black/10 bg-[#fcfbf8] p-spacing-4 shadow-sm transition-colors duration-200 dark:border-surface-warm-white/12 dark:bg-surface-warm-white/5 dark:shadow-none"
                key={entry.id}
              >
                <div className="flex items-start justify-between gap-spacing-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[#1c1c1c] dark:text-surface-warm-white">
                      {streamerMode ? (
                        <SensitiveText kind="name" value={entry.businessName} />
                      ) : (
                        entry.businessName
                      )}
                    </p>
                    {entry.businessType ? (
                      <p className="text-sm text-[#5f5f5d] dark:text-surface-warm-white/70">
                        {entry.businessType}
                      </p>
                    ) : null}
                    <p className="text-sm text-[#5f5f5d] dark:text-surface-warm-white/70">
                      {streamerMode ? (
                        <SensitiveText kind="email" value={entry.email} />
                      ) : (
                        entry.email
                      )}
                    </p>
                    {entry.phone ? (
                      <p className="text-sm text-[#5f5f5d] dark:text-surface-warm-white/70">
                        {streamerMode ? (
                          <SensitiveText kind="phone" value={entry.phone} />
                        ) : (
                          entry.phone
                        )}
                      </p>
                    ) : null}
                  </div>
                  <AdminStatusBadge tone={status.tone}>
                    {status.label}
                  </AdminStatusBadge>
                </div>
                <p className="mt-spacing-2 line-clamp-4 text-sm text-[#1c1c1c] dark:text-surface-warm-white">
                  {entry.story}
                </p>
                {entry.rejectionReason ? (
                  <p className="mt-spacing-2 text-sm text-destructive">
                    Alasan tolak: {entry.rejectionReason}
                  </p>
                ) : null}
                {entry.imageCount > 0 ? (
                  <div className="mt-spacing-2 flex flex-wrap gap-spacing-2">
                    {Array.from({ length: entry.imageCount }).map(
                      (_, index) => (
                        <img
                          alt={`${entry.businessName} (${index + 1}/${entry.imageCount})`}
                          className="max-h-48 rounded-radius-md border border-black/10 dark:border-surface-warm-white/12"
                          key={`${entry.id}-${index}`}
                          src={`/api/admin/waitlist/image/${entry.id}/${index}?v=2`}
                        />
                      ),
                    )}
                  </div>
                ) : null}
                {isPending(entry.status) ? (
                  <div className="mt-spacing-4 flex gap-spacing-3">
                    <button
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate({ action: "approve", entryId: entry.id })
                      }
                      type="button"
                    >
                      {approving ? "Menyetujui..." : "Setujui"}
                    </button>
                    <button
                      className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/20 hover:border-destructive/40 transition disabled:opacity-50"
                      disabled={act.isPending}
                      onClick={() => {
                        const reason =
                          window.prompt("Alasan penolakan (opsional)?") ?? "";
                        act.mutate({
                          action: "reject",
                          entryId: entry.id,
                          reason,
                        });
                      }}
                      type="button"
                    >
                      {rowActionPending && !approving ? "Menolak..." : "Tolak"}
                    </button>
                  </div>
                ) : entry.status === "rejected" ? (
                  <div className="mt-spacing-4 flex gap-spacing-3">
                    <button
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate({ action: "approve", entryId: entry.id })
                      }
                      type="button"
                    >
                      {approving ? "Menyetujui..." : "Setujui (Koreksi)"}
                    </button>
                  </div>
                ) : entry.status === "approved" ? (
                  <div className="mt-spacing-4 flex gap-spacing-3">
                    <button
                      className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/20 hover:border-destructive/40 transition disabled:opacity-50"
                      disabled={act.isPending}
                      onClick={() => {
                        const reason =
                          window.prompt(
                            "Alasan pembatalan persetujuan (opsional)?",
                          ) ?? "";
                        act.mutate({
                          action: "reject",
                          entryId: entry.id,
                          reason,
                        });
                      }}
                      type="button"
                    >
                      {rowActionPending
                        ? "Membatalkan..."
                        : "Batalkan Persetujuan"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
