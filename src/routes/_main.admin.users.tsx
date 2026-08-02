import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { userFlagsDisplay } from "@/components/admin/admin-status";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminStatusFilter } from "@/components/admin/AdminStatusFilter";
import { SensitiveText } from "@/components/admin/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode-context";
import { fetchJson } from "@/lib/query-client";

type AdminUser = {
  bannedAt: string | null;
  createdAt: string;
  email: string | null;
  id: string;
  name: string | null;
  phone: string | null;
  projectsCount: number;
  verified: boolean;
};

type UsersResponse = {
  page: number;
  total: number;
  totalPages: number;
  users: AdminUser[];
};

const USER_STATUS_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "unverified", label: "Belum verifikasi" },
  { value: "banned", label: "Diblokir" },
  { value: "active", label: "Aktif" },
] as const;

export const Route = createFileRoute("/_main/admin/users")({
  component: UsersPage,
});

function UsersPage() {
  const streamerMode = useStreamerMode();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryFn: () =>
      fetchJson<UsersResponse>(
        `/api/admin/users?status=${status}&q=${encodeURIComponent(q)}&page=${page}`,
      ),
    queryKey: ["admin", "users", status, q, page],
  });

  const ban = useMutation({
    mutationFn: (vars: { action: "ban" | "unban"; id: string }) =>
      fetchJson(`/api/admin/users/${vars.id}?action=${vars.action}`, {
        method: "POST",
      }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success(
        vars.action === "ban" ? "Pengguna diblokir." : "Blokir dibatalkan.",
      );
    },
    onError: () => toast.error("Gagal. Coba lagi."),
  });

  const users = data?.users ?? [];
  return (
    <div className="flex flex-col gap-spacing-3">
      <AdminStatusFilter
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        options={USER_STATUS_OPTIONS}
        value={status}
      />
      <input
        className="rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-3 py-spacing-2 text-sm"
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        placeholder="Cari nama atau email…"
        value={q}
      />
      {users.length === 0 ? (
        <p className="text-surface-warm-white/70">
          {status === "unverified"
            ? "Tidak ada pengguna belum verifikasi."
            : "Tidak ada pengguna."}
        </p>
      ) : (
        users.map((u) => (
          <div
            className="flex items-center justify-between rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
            key={u.id}
          >
            <div>
              <p className="font-medium">
                {streamerMode && u.name ? (
                  <SensitiveText kind="name" value={u.name} />
                ) : (
                  (u.name ?? "Tanpa nama")
                )}
              </p>
              <p className="text-surface-warm-white">
                {streamerMode && u.email ? (
                  <SensitiveText kind="email" value={u.email} />
                ) : (
                  u.email
                )}
              </p>
              <div className="mt-spacing-1 flex flex-wrap items-center gap-spacing-2 text-surface-warm-white/70">
                <span>{u.projectsCount} proyek</span>
                {userFlagsDisplay({
                  verified: u.verified,
                  banned: Boolean(u.bannedAt),
                }).map((flag) => (
                  <AdminStatusBadge key={flag.label} tone={flag.tone}>
                    {flag.label}
                  </AdminStatusBadge>
                ))}
              </div>
            </div>
            <button
              className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm"
              onClick={() =>
                ban.mutate({
                  action: u.bannedAt ? "unban" : "ban",
                  id: u.id,
                })
              }
              type="button"
            >
              {u.bannedAt ? "Buka blokir" : "Blokir"}
            </button>
          </div>
        ))
      )}
      {data && data.totalPages > 1 ? (
        <div className="flex gap-spacing-2">
          <button
            className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            Sebelumnya
          </button>
          <span className="px-spacing-2 py-spacing-2 text-sm text-surface-warm-white/70">
            {page} / {data.totalPages}
          </span>
          <button
            className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm disabled:opacity-40"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            type="button"
          >
            Berikutnya
          </button>
        </div>
      ) : null}
    </div>
  );
}
