import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdminStatusBadge } from "@/components/admin/status/AdminStatusBadge";
import { AdminStatusFilter } from "@/components/admin/status/AdminStatusFilter";
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveAsyncListState } from "@/lib/async-list-state";
import { fetchJson } from "@/lib/query-client";

/** id-ID thousands: 1000000 → "1.000.000" */
function formatGroupedNumber(value: unknown): string {
  if (value === "" || value === null || value === undefined) {
    return "";
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return "";
  }
  return Math.trunc(n).toLocaleString("id-ID");
}

/** Strip non-digits; empty → "" for draft, else number. */
function parseGroupedNumber(raw: string): number | "" {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") {
    return "";
  }
  return Number(digits);
}

type AdminUser = {
  bannedAt: string | null;
  createdAt: string;
  email: string | null;
  id: string;
  name: string | null;
  projectsCount: number;
};

type UsersResponse = {
  page: number;
  total: number;
  totalPages: number;
  users: AdminUser[];
};

const USER_STATUS_OPTIONS = [
  { value: "all", label: "Semua" },
  { value: "banned", label: "Diblokir" },
  { value: "active", label: "Aktif" },
] as const;

export const Route = createFileRoute("/_main/admin/users")({
  component: UsersPage,
});

function UserListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-spacing-3" role="status">
      {["one", "two", "three"].map((key) => (
        <div
          className="flex h-20 animate-pulse items-center justify-between rounded-radius-md border border-black/10 bg-black/[0.03] p-spacing-3 dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5"
          key={key}
        >
          <div className="flex flex-col gap-spacing-2">
            <span className="h-4 w-36 rounded bg-black/10 dark:bg-surface-warm-white/10" />
            <span className="h-3 w-52 rounded bg-black/5 dark:bg-surface-warm-white/8" />
          </div>
          <span className="h-9 w-24 rounded-radius-md bg-black/5 dark:bg-surface-warm-white/8" />
        </div>
      ))}
    </div>
  );
}

function UsersPage() {
  const streamerMode = useStreamerMode();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { data, isError, isPending, refetch } = useQuery({
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

  const grant = useMutation({
    mutationFn: (vars: { id: string; amount: number }) =>
      fetchJson(`/api/admin/users/${vars.id}?action=grant-energy`, {
        method: "POST",
        body: JSON.stringify({ amount: vars.amount }),
      }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success(
        vars.amount >= 1_000_000
          ? `Energi ${formatGroupedNumber(vars.amount)} ditambahkan.`
          : "Energi ditambahkan.",
      );
      setGrantTarget(null);
    },
    onError: () => toast.error("Gagal menambah energi."),
  });

  const [grantTarget, setGrantTarget] = useState<AdminUser | null>(null);
  const [grantRaw, setGrantRaw] = useState("");
  const grantAmount = parseGroupedNumber(grantRaw);

  const openGrant = (user: AdminUser) => {
    setGrantTarget(user);
    setGrantRaw("");
  };

  const users = data?.users ?? [];
  const listState = resolveAsyncListState({
    isError,
    isPending,
    items: data?.users,
  });
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
        className="rounded-radius-md border border-black/15 bg-black/[0.02] px-spacing-3 py-spacing-2 text-sm text-[#1c1c1c] placeholder:text-[#5f5f5d] focus:outline-none focus:ring-1 focus:ring-[#1c1c1c] dark:border-surface-warm-white/15 dark:bg-surface-warm-white/5 dark:text-surface-warm-white dark:placeholder:text-surface-warm-white/50 dark:focus:ring-surface-warm-white"
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        placeholder="Cari nama atau email…"
        value={q}
      />
      {listState === "loading" ? (
        <UserListSkeleton />
      ) : listState === "error" ? (
        <div className="flex flex-col items-center gap-spacing-3 py-spacing-8 text-center">
          <p className="text-sm text-[#5f5f5d] dark:text-surface-warm-white/70">
            Pengguna belum bisa dimuat.
          </p>
          <button
            className="rounded-radius-md border border-black/15 px-spacing-3 py-spacing-2 text-sm text-[#1c1c1c] hover:bg-black/5 dark:border-surface-warm-white/15 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/10"
            onClick={() => void refetch()}
            type="button"
          >
            Coba lagi
          </button>
        </div>
      ) : listState === "empty" ? (
        <p className="text-[#5f5f5d] dark:text-surface-warm-white/70">
          Tidak ada pengguna.
        </p>
      ) : (
        users.map((u) => (
          <div
            className="flex items-center justify-between rounded-radius-md border border-black/10 bg-[#fcfbf8] p-spacing-3 text-sm text-[#1c1c1c] dark:border-surface-warm-white/12 dark:bg-surface-warm-white/5 dark:text-surface-warm-white"
            key={u.id}
          >
            <div>
              <p className="font-medium text-[#1c1c1c] dark:text-surface-warm-white">
                {streamerMode && u.name ? (
                  <SensitiveText kind="name" value={u.name} />
                ) : (
                  (u.name ?? "Tanpa nama")
                )}
              </p>
              <p className="text-[#5f5f5d] dark:text-surface-warm-white/70">
                {streamerMode && u.email ? (
                  <SensitiveText kind="email" value={u.email} />
                ) : (
                  u.email
                )}
              </p>
              <div className="mt-spacing-1 flex flex-wrap items-center gap-spacing-2 text-xs text-[#5f5f5d] dark:text-surface-warm-white/70">
                <span>{u.projectsCount} proyek</span>
                {u.bannedAt ? (
                  <AdminStatusBadge tone="danger">Diblokir</AdminStatusBadge>
                ) : null}
              </div>
            </div>
            <div className="flex gap-spacing-2">
              <button
                className="rounded-radius-md border border-black/15 bg-black/[0.02] px-spacing-3 py-spacing-2 text-sm text-[#1c1c1c] hover:bg-black/5 dark:border-surface-warm-white/15 dark:bg-surface-warm-white/5 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/10"
                onClick={() => openGrant(u)}
                type="button"
              >
                Tambah energi
              </button>
              <button
                className="rounded-radius-md border border-black/15 bg-black/[0.02] px-spacing-3 py-spacing-2 text-sm text-[#1c1c1c] hover:bg-black/5 dark:border-surface-warm-white/15 dark:bg-surface-warm-white/5 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/10"
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
          </div>
        ))
      )}
      {data && data.totalPages > 1 ? (
        <div className="flex gap-spacing-2">
          <button
            className="rounded-radius-md border border-black/15 px-spacing-3 py-spacing-2 text-sm text-[#1c1c1c] disabled:opacity-40 dark:border-surface-warm-white/15 dark:text-surface-warm-white"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            Sebelumnya
          </button>
          <span className="px-spacing-2 py-spacing-2 text-sm text-[#5f5f5d] dark:text-surface-warm-white/70">
            {page} / {data.totalPages}
          </span>
          <button
            className="rounded-radius-md border border-black/15 px-spacing-3 py-spacing-2 text-sm text-[#1c1c1c] disabled:opacity-40 dark:border-surface-warm-white/15 dark:text-surface-warm-white"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            type="button"
          >
            Berikutnya
          </button>
        </div>
      ) : null}
      <Dialog
        open={grantTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setGrantTarget(null);
          }
        }}
      >
        <DialogContent showCloseButton className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah energi</DialogTitle>
            <DialogDescription>
              Tambahkan energi untuk{" "}
              {grantTarget?.name || grantTarget?.email || "pengguna"}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-spacing-3">
            <label className="text-sm text-[#5f5f5d] dark:text-surface-warm-white/80">
              Jumlah energi
            </label>
            <input
              autoFocus
              className="rounded-radius-md border border-black/15 bg-black/[0.02] px-spacing-3 py-spacing-2 text-sm text-[#1c1c1c] dark:border-surface-warm-white/15 dark:bg-surface-warm-white/5 dark:text-surface-warm-white"
              inputMode="numeric"
              onChange={(e) => setGrantRaw(e.target.value)}
              placeholder="1.000.000"
              value={formatGroupedNumber(grantAmount)}
            />
            <div className="flex justify-end gap-spacing-2">
              <button
                className="rounded-radius-md border border-black/15 px-spacing-3 py-spacing-2 text-sm text-[#1c1c1c] hover:bg-black/5 dark:border-surface-warm-white/15 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/10"
                onClick={() => setGrantTarget(null)}
                type="button"
              >
                Batal
              </button>
              <button
                className="rounded-radius-md bg-[#1c1c1c] px-spacing-3 py-spacing-2 text-sm text-surface-warm-white hover:bg-black disabled:opacity-40 dark:bg-surface-warm-white dark:text-foreground-primary dark:hover:bg-white"
                disabled={grantAmount === "" || grantAmount <= 0}
                onClick={() => {
                  if (grantTarget && grantAmount !== "" && grantAmount > 0) {
                    grant.mutate({ amount: grantAmount, id: grantTarget.id });
                  }
                }}
                type="button"
              >
                Konfirmasi
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
