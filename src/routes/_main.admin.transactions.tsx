import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

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

function TransactionsPage() {
  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const queryClient = useQueryClient();
  const { data } = useQuery({
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
      toast.success("Status disinkronkan.");
    },
    onError: () => toast.error("Gagal verifikasi."),
  });

  const txs = data?.payments ?? [];
  return (
    <div className="flex flex-col gap-spacing-3">
      <div className="flex gap-spacing-2">
        {["ALL", "PENDING", "COMPLETED", "FAILED"].map((s) => (
          <button
            className={
              status === s
                ? "rounded-radius-md bg-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white"
                : "rounded-radius-md border border-surface-warm-white/15 px-spacing-3 py-spacing-2 text-sm text-surface-warm-white/70"
            }
            key={s}
            onClick={() => setStatus(s)}
            type="button"
          >
            {s === "ALL" ? "Semua" : s}
          </button>
        ))}
      </div>
      <input
        className="rounded-radius-md border border-surface-warm-white/15 bg-surface-warm-white/5 px-spacing-3 py-spacing-2 text-sm"
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari order id atau email…"
        value={q}
      />
      {txs.length === 0 ? (
        <p className="text-surface-warm-white/70">Tidak ada transaksi.</p>
      ) : (
        txs.map((t) => (
          <div
            className="rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
            key={t.orderId}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono">{t.orderId}</span>
              <span
                className={
                  t.status === "COMPLETED"
                    ? "text-emerald-400"
                    : t.status === "PENDING"
                      ? "text-amber-400"
                      : "text-red-400"
                }
              >
                {t.status}
              </span>
            </div>
            <p className="text-surface-warm-white">
              {formatRupiah(t.amount)} · {t.energyGranted} energi ·{" "}
              {t.email ?? "—"}
            </p>
            {t.paymentNumber ? (
              <p className="text-surface-warm-white/70">{t.paymentNumber}</p>
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
        ))
      )}
    </div>
  );
}
