import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SensitiveText } from "@/components/admin/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode-context";
import { requireAdmin } from "@/lib/auth-admin";
import { fetchJson } from "@/lib/query-client";
import { listPendingWaitlist } from "@/lib/waitlist";

type PendingEntry = {
  businessName: string;
  businessType: string | null;
  id: string;
  imageCount: number;
  phone: string | null;
  status: string;
  story: string;
  submittedAt: string;
};

function imageRefs(entry: { imageRef: string | null }): string[] {
  if (!entry.imageRef) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(entry.imageRef);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((ref): ref is string => typeof ref === "string");
  } catch {
    return [];
  }
}

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
        imageCount: imageRefs(entry).length,
        phone: entry.phone,
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
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "waitlist"] });
      toast.success(vars.action === "approve" ? "Disetujui." : "Ditolak.");
    },
    onError: () => toast.error("Gagal memproses. Coba lagi."),
  });

  const entries = data?.entries ?? [];

  return (
    <div className="flex flex-col gap-spacing-3">
      {entries.length === 0 ? (
        <p className="text-surface-warm-white/70">
          Belum ada pendaftar menunggu.
        </p>
      ) : (
        entries.map((entry) => (
          <div
            className="rounded-radius-lg border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-4"
            key={entry.id}
          >
            <div className="flex items-start justify-between gap-spacing-3">
              <div>
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
            </div>
            <p className="mt-spacing-2 line-clamp-4 text-sm text-surface-warm-white">
              {streamerMode ? (
                <SensitiveText kind="story" value={entry.story} />
              ) : (
                entry.story
              )}
            </p>
            {entry.imageCount > 0 ? (
              <div className="mt-spacing-2 flex flex-wrap gap-spacing-2">
                {Array.from({ length: entry.imageCount }).map((_, index) => (
                  <img
                    alt={`${entry.businessName} (${index + 1}/${entry.imageCount})`}
                    className="max-h-48 rounded-radius-md border border-surface-warm-white/12"
                    key={`${entry.id}-${index}`}
                    src={`/api/admin/waitlist/image/${entry.id}/${index}?v=1`}
                  />
                ))}
              </div>
            ) : null}
            <div className="mt-spacing-3 flex gap-spacing-2">
              <button
                className="rounded-radius-md bg-emerald-600 px-spacing-3 py-spacing-2 text-sm text-white"
                onClick={() =>
                  act.mutate({ action: "approve", entryId: entry.id })
                }
                type="button"
              >
                Setujui
              </button>
              <button
                className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
                onClick={() => {
                  const reason =
                    window.prompt("Alasan penolakan (opsional)?") ?? "";
                  act.mutate({ action: "reject", entryId: entry.id, reason });
                }}
                type="button"
              >
                Tolak
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
