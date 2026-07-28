import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { fetchJson } from "@/lib/query-client";

type Overview = {
  stats: {
    paymentsThisMonth: number;
    projects: number;
    revenueThisMonth: number;
    users: number;
    waitlistPending: number;
  };
  recentWaitlist: { businessName: string; id: string; submittedAt: string }[];
  recentTransactions: {
    amount: number;
    createdAt: string;
    orderId: string;
    status: string;
  }[];
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export const Route = createFileRoute("/_main/admin/")({
  component: OverviewPage,
});

function OverviewPage() {
  const { data } = useQuery({
    queryFn: () => fetchJson<Overview>("/api/admin/overview"),
    queryKey: ["admin", "overview"],
  });

  const stats = data?.stats;
  const tiles = stats
    ? [
        { label: "Pengguna", value: String(stats.users) },
        { label: "Antrean menunggu", value: String(stats.waitlistPending) },
        { label: "Proyek", value: String(stats.projects) },
        {
          label: "Pembayaran bulan ini",
          value: String(stats.paymentsThisMonth),
        },
        {
          label: "Pendapatan bulan ini",
          value: formatRupiah(stats.revenueThisMonth),
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-spacing-4">
      <div className="grid grid-cols-2 gap-spacing-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div
            className="rounded-radius-lg border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-4"
            key={tile.label}
          >
            <p className="text-sm text-surface-warm-white/70">{tile.label}</p>
            <p className="mt-spacing-1 text-xl font-semibold">{tile.value}</p>
          </div>
        ))}
      </div>
      <section>
        <h2 className="mb-spacing-2 text-lg font-semibold">
          Pendaftar terbaru
        </h2>
        {data?.recentWaitlist.length ? (
          <ul className="flex flex-col gap-spacing-2">
            {data.recentWaitlist.map((e) => (
              <li
                className="rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
                key={e.id}
              >
                <span className="font-medium">{e.businessName}</span>
                <span className="text-surface-warm-white/70">
                  {" · "}
                  {new Date(e.submittedAt).toLocaleDateString("id-ID")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-surface-warm-white/70">
            Belum ada pendaftar menunggu.
          </p>
        )}
      </section>
      <section>
        <h2 className="mb-spacing-2 text-lg font-semibold">
          Transaksi terbaru
        </h2>
        {data?.recentTransactions.length ? (
          <ul className="flex flex-col gap-spacing-2">
            {data.recentTransactions.map((t) => (
              <li
                className="flex items-center justify-between rounded-radius-md border border-surface-warm-white/12 bg-surface-warm-white/5 p-spacing-3 text-sm"
                key={t.orderId}
              >
                <span className="font-mono">{t.orderId}</span>
                <span className="text-surface-warm-white">
                  {formatRupiah(t.amount)} · {t.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-surface-warm-white/70">
            Belum ada transaksi.
          </p>
        )}
      </section>
    </div>
  );
}
