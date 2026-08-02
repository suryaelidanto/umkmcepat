import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { waitlistStatusDisplay } from "@/components/admin/admin-status";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminStatusFilter } from "@/components/admin/AdminStatusFilter";
import { SensitiveText } from "@/components/admin/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode-context";
import { requireAdmin } from "@/lib/auth-admin";
import { fetchJson } from "@/lib/query-client";
import { listPendingWaitlist } from "@/lib/waitlist";

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
  const initial = Route.useLoaderData() as unknown as {
    entries: AdminEntry[];
  };

  const { data } = useQuery({
    queryFn: () =>
      fetchJson<{ entries: AdminEntry[] }>(
        `/api/admin/waitlist?status=${status}`,
      ),
    queryKey: ["admin", "waitlist", status],
    initialData:
      status === "pending" ? { entries: initial.entries } : undefined,
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
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "waitlist"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "nav-counts"] });
      toast.success(vars.action === "approve" ? "Disetujui." : "Ditolak.");
    },
    onError: () => toast.error("Gagal memproses. Coba lagi."),
  });

  const entries = data?.entries ?? [];

  return (
    <div className="flex flex-col gap-spacing-3">
      <AdminStatusFilter
        onChange={(v) => setStatus(v as WaitlistStatusFilter)}
        options={STATUS_OPTIONS}
        value={status}
      />

      {entries.length === 0 ? (
        <p className="text-surface-warm-white/70">
          {status === "pending"
            ? "Belum ada pendaftar menunggu."
            : "Tidak ada di filter ini."}
        </p>
      ) : (
        entries.map((entry) => {
          const status = waitlistStatusDisplay(entry.status);
          return (
            <div
              className="rounded-radius-lg border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-4"
              key={entry.id}
            >
              <div className="flex items-start justify-between gap-spacing-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {streamerMode ? (
                      <SensitiveText kind="name" value={entry.businessName} />
                    ) : (
                      entry.businessName
                    )}
                  </p>
                  {entry.businessType ? (
                    <p className="text-sm text-surface-warm-white/70">
                      {entry.businessType}
                    </p>
                  ) : null}
                  <p className="text-sm text-surface-warm-white/70">
                    {streamerMode ? (
                      <SensitiveText kind="email" value={entry.email} />
                    ) : (
                      entry.email
                    )}
                  </p>
                  {entry.phone ? (
                    <p className="text-sm text-surface-warm-white/70">
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
              <p className="mt-spacing-2 line-clamp-4 text-sm text-surface-warm-white">
                {entry.story}
              </p>
              {entry.rejectionReason ? (
                <p className="mt-spacing-2 text-sm text-destructive">
                  Alasan tolak: {entry.rejectionReason}
                </p>
              ) : null}
              {entry.imageCount > 0 ? (
                <div className="mt-spacing-2 flex flex-wrap gap-spacing-2">
                  {Array.from({ length: entry.imageCount }).map((_, index) => (
                    <img
                      alt={`${entry.businessName} (${index + 1}/${entry.imageCount})`}
                      className="max-h-48 rounded-radius-md border border-surface-warm-white/12"
                      key={`${entry.id}-${index}`}
                      src={`/api/admin/waitlist/image/${entry.id}/${index}?v=2`}
                    />
                  ))}
                </div>
              ) : null}
              {isPending(entry.status) ? (
                <div className="mt-spacing-3 flex gap-spacing-2">
                  <button
                    className="rounded-radius-md bg-emerald-600 px-spacing-3 py-spacing-2 text-sm text-white"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate({ action: "approve", entryId: entry.id })
                    }
                    type="button"
                  >
                    Setujui
                  </button>
                  <button
                    className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
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
                    Tolak
                  </button>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
