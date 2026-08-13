import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { paymentStatusDisplay } from "@/components/admin/admin-status";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminStatusFilter } from "@/components/admin/AdminStatusFilter";
import { SensitiveText } from "@/components/admin/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode-context";
import { resolveAsyncListState } from "@/lib/async-list-state";
import { fetchJson } from "@/lib/query-client";

type Tx = {
  amount: number;
  createdAt: string;
  email: string | null;
  energyGranted: number;
  orderId: string;
  paymentMethod: string | null;
  paymentNumber: string | null;
  status: string;
  updatedAt: string;
};
type TxResponse = {
  page: number;
  total: number;
  totalPages: number;
  payments: Tx[];
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export const Route = createFileRoute("/_main/admin/transactions")({
  component: TransactionsPage,
});

const TX_STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
  { value: "ALL", label: "Semua" },
] as const;

function TransactionListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-spacing-3" role="status">
      {["one", "two", "three"].map((key) => (
        <div
          className="flex h-28 animate-pulse flex-col justify-between rounded-radius-md border border-surface-warm-white/10 bg-surface-warm-white/5 p-spacing-3"
          key={key}
        >
          <div className="flex items-center justify-between gap-spacing-3">
            <span className="h-4 w-36 rounded bg-surface-warm-white/10" />
            <span className="h-6 w-24 rounded-radius-md bg-surface-warm-white/8" />
          </div>
          <span className="h-4 w-64 max-w-full rounded bg-surface-warm-white/8" />
          <span className="h-3 w-28 rounded bg-surface-warm-white/8" />
        </div>
      ))}
    </div>
  );
}

function TransactionsPage() {
  const streamerMode = useStreamerMode();
  // Default work queue: unresolved payments.
  const [status, setStatus] = useState("PENDING");
  const [q, setQ] = useState("");
  const queryClient = useQueryClient();
  const { data, isError, isPending, refetch } = useQuery({
    queryFn: () =>
      fetchJson<TxResponse>(
        `/api/admin/transactions?status=${status}&q=${encodeURIComponent(q)}`,
      ),
    queryKey: ["admin", "transactions", status, q],
  });

  const verify = useMutation({
    mutationFn: (orderId: string) =>
      fetchJson(`/api/admin/transactions/${orderId}/verify`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "nav-counts"] });
      toast.success("Status disinkronkan.");
    },
    onError: () => toast.error("Gagal verifikasi."),
  });

  const txs = data?.payments ?? [];
  const listState = resolveAsyncListState({
    isError,
    isPending,
    items: data?.payments,
  });
  return (
    <div className="flex flex-col gap-spacing-3">
      <AdminStatusFilter
        onChange={setStatus}
        options={TX_STATUS_OPTIONS}
        value={status}
      />
      <input
        className="rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-3 py-spacing-2 text-sm"
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari order id atau email…"
        value={q}
      />
      {listState === "loading" ? (
        <TransactionListSkeleton />
      ) : listState === "error" ? (
        <div className="flex flex-col items-center gap-spacing-3 py-spacing-8 text-center">
          <p className="text-sm text-surface-warm-white/70">
            Transaksi belum bisa dimuat.
          </p>
          <button
            className="rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm"
            onClick={() => void refetch()}
            type="button"
          >
            Coba lagi
          </button>
        </div>
      ) : listState === "empty" ? (
        <p className="text-surface-warm-white/70">Tidak ada transaksi.</p>
      ) : (
        txs.map((t) => {
          const payment = paymentStatusDisplay(t.status);
          return (
            <div
              className="rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
              key={t.orderId}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono">
                  {streamerMode ? (
                    <SensitiveText kind="orderId" value={t.orderId} />
                  ) : (
                    t.orderId
                  )}
                </span>
                <AdminStatusBadge tone={payment.tone}>
                  {payment.label}
                </AdminStatusBadge>
              </div>
              <p className="text-surface-warm-white">
                {streamerMode ? (
                  <>
                    <SensitiveText
                      kind="amount"
                      value={formatRupiah(t.amount)}
                    />{" "}
                    · {t.energyGranted} energi ·{" "}
                    {t.email ? (
                      <SensitiveText kind="email" value={t.email} />
                    ) : (
                      "—"
                    )}
                  </>
                ) : (
                  <>
                    {formatRupiah(t.amount)} · {t.energyGranted} energi ·{" "}
                    {t.email ?? "—"}
                  </>
                )}
              </p>
              {t.paymentNumber ? (
                <p className="text-surface-warm-white/70">
                  {streamerMode ? (
                    <SensitiveText kind="orderId" value={t.paymentNumber} />
                  ) : (
                    t.paymentNumber
                  )}
                </p>
              ) : null}
              {t.status === "PENDING" ? (
                <button
                  className="mt-spacing-2 rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
                  onClick={() => verify.mutate(t.orderId)}
                  type="button"
                >
                  Verifikasi
                </button>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
