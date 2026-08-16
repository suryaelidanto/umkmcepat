"use client";

import {
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FolderKanban,
  Users,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { paymentStatusDisplay } from "@/components/admin/admin-status";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { SensitiveText } from "@/components/admin/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode-context";
import { Link } from "@/components/ui/link";

export type OverviewData = {
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

/** Synthetic sparkline until a real trend API exists. */
function sparkFrom(stats: OverviewData["stats"]) {
  const base = Math.max(stats.revenueThisMonth, 1);
  return [0.55, 0.62, 0.58, 0.7, 0.68, 0.82, 1].map((f, i) => ({
    day: `H${i + 1}`,
    value: Math.round(base * f),
  }));
}

function KpiGrid({ stats }: { stats: OverviewData["stats"] }) {
  const items = [
    { label: "Pengguna", value: String(stats.users), icon: Users },
    {
      label: "Antrean",
      value: String(stats.waitlistPending),
      icon: ClipboardList,
    },
    { label: "Proyek", value: String(stats.projects), icon: FolderKanban },
    {
      label: "Bayar bln ini",
      value: String(stats.paymentsThisMonth),
      icon: CreditCard,
    },
    {
      label: "Pendapatan",
      value: formatRupiah(stats.revenueThisMonth),
      icon: CreditCard,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((s) => {
        const Icon = s.icon;
        return (
          <DashboardCard className="p-3" key={s.label}>
            <div className="flex items-center justify-between text-xs text-[#5f5f5d] dark:text-surface-warm-white/55">
              <span>{s.label}</span>
              <Icon className="size-3.5 opacity-60" />
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums text-[#1c1c1c] dark:text-surface-warm-white">
              {s.value}
            </p>
          </DashboardCard>
        );
      })}
    </div>
  );
}

function RevenueChart({ data }: { data: OverviewData }) {
  const rows = sparkFrom(data.stats);
  return (
    <DashboardCard className="min-h-[220px] p-4">
      <div className="mb-3">
        <p className="text-xs tracking-wide text-[#5f5f5d] dark:text-surface-warm-white/55">
          Pendapatan (ilustrasi)
        </p>
        <p className="text-2xl font-semibold tabular-nums text-[#1c1c1c] dark:text-surface-warm-white">
          {formatRupiah(data.stats.revenueThisMonth)}
        </p>
        <p className="text-[11px] text-[#5f5f5d]/80 dark:text-surface-warm-white/45">
          Sparkline sintetis — bukan histori real. Ganti saat API trend ada.
        </p>
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={rows}>
            <CartesianGrid
              stroke="rgba(128,128,128,0.15)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="day"
              tick={{ fill: "currentColor", fontSize: 11, opacity: 0.6 }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--tooltip-bg, #1c1c1a)",
                borderColor: "rgba(128,128,128,0.2)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--tooltip-fg, #eceae4)",
              }}
              formatter={(v) => formatRupiah(Number(v))}
            />
            <Line
              dataKey="value"
              dot={false}
              stroke="currentColor"
              className="text-[#1c1c1c] dark:text-surface-warm-white"
              strokeWidth={2}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  );
}

function InvoicesTable({ data }: { data: OverviewData }) {
  const streamerMode = useStreamerMode();
  const rows = data.recentTransactions;
  return (
    <DashboardCard>
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-surface-warm-white/10">
        <div>
          <p className="text-sm font-medium text-[#1c1c1c] dark:text-surface-warm-white">
            Transaksi terbaru
          </p>
          <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/50">
            Order · status · jumlah
          </p>
        </div>
        <Link
          className="text-xs text-[#5f5f5d] underline-offset-2 hover:underline hover:text-[#1c1c1c] dark:text-surface-warm-white/70 dark:hover:text-surface-warm-white"
          href="/admin/transactions"
        >
          Semua
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-[#5f5f5d] dark:text-surface-warm-white/55">
          Belum ada transaksi.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs text-[#5f5f5d] dark:border-surface-warm-white/10 dark:text-surface-warm-white/50">
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  className="border-b border-black/5 text-[#1c1c1c] dark:border-surface-warm-white/8 dark:text-surface-warm-white"
                  key={t.orderId}
                >
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {streamerMode ? (
                      <SensitiveText kind="orderId" value={t.orderId} />
                    ) : (
                      t.orderId
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {(() => {
                      const display = paymentStatusDisplay(t.status);
                      return (
                        <AdminStatusBadge tone={display.tone}>
                          {display.label}
                        </AdminStatusBadge>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {streamerMode ? (
                      <SensitiveText
                        kind="amount"
                        value={formatRupiah(t.amount)}
                      />
                    ) : (
                      formatRupiah(t.amount)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  );
}

function ActivityFeed({ data }: { data: OverviewData }) {
  const streamerMode = useStreamerMode();
  const items = [
    ...data.recentWaitlist.map((e) => ({
      id: e.id,
      title: e.businessName,
      kind: "waitlist" as const,
      time: e.submittedAt,
    })),
    ...data.recentTransactions.map((t) => ({
      id: t.orderId,
      title: t.orderId,
      kind: "tx" as const,
      time: t.createdAt,
      status: t.status,
    })),
  ]
    .sort((a, b) => +new Date(b.time) - +new Date(a.time))
    .slice(0, 8);

  return (
    <DashboardCard>
      <div className="border-b border-black/10 px-4 py-3 dark:border-surface-warm-white/10">
        <p className="text-sm font-medium text-[#1c1c1c] dark:text-surface-warm-white">
          Aktivitas
        </p>
        <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/50">
          Antrean + transaksi
        </p>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-[#5f5f5d] dark:text-surface-warm-white/55">
          <CheckCircle2 className="size-6 opacity-50" />
          Tidak ada aktivitas terbaru.
        </div>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-surface-warm-white/8">
          {items.map((item) => {
            const payment =
              "status" in item && item.status
                ? paymentStatusDisplay(item.status)
                : null;
            return (
              <li
                className="flex items-start gap-3 px-4 py-3 text-sm text-[#1c1c1c] dark:text-surface-warm-white"
                key={`${item.kind}-${item.id}`}
              >
                <span className="mt-0.5 text-[#5f5f5d] dark:text-surface-warm-white/40">
                  {item.kind === "waitlist" ? (
                    <ClipboardList className="size-4" />
                  ) : (
                    <CreditCard className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {item.kind === "waitlist" ? (
                      streamerMode ? (
                        <SensitiveText kind="name" value={item.title} />
                      ) : (
                        item.title
                      )
                    ) : streamerMode ? (
                      <SensitiveText kind="orderId" value={item.title} />
                    ) : (
                      item.title
                    )}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-[#5f5f5d] dark:text-surface-warm-white/50">
                    <span>
                      {item.kind === "waitlist" ? "Antrean" : "Transaksi"} ·{" "}
                      {new Date(item.time).toLocaleDateString("id-ID")}
                    </span>
                    {payment ? (
                      <AdminStatusBadge tone={payment.tone}>
                        {payment.label}
                      </AdminStatusBadge>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-black/10 px-4 py-2 dark:border-surface-warm-white/10">
        <Link
          className="text-xs text-[#5f5f5d] underline-offset-2 hover:underline hover:text-[#1c1c1c] dark:text-surface-warm-white/70 dark:hover:text-surface-warm-white"
          href="/admin/waitlist"
        >
          Buka antrean
        </Link>
      </div>
    </DashboardCard>
  );
}

function BillingHealth({ stats }: { stats: OverviewData["stats"] }) {
  const ok = stats.waitlistPending === 0;
  return (
    <DashboardCard className="p-4">
      <p className="text-xs tracking-wide text-[#5f5f5d] dark:text-surface-warm-white/55">
        Kesehatan ops
      </p>
      {ok ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm font-medium text-[#1c1c1c] dark:text-surface-warm-white">
            Tidak ada antrean menunggu.
          </p>
          <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/55">
            {stats.paymentsThisMonth} pembayaran selesai bulan ini ·{" "}
            {stats.projects} proyek.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm font-medium text-[#1c1c1c] dark:text-surface-warm-white">
            {stats.waitlistPending} antrean perlu review
          </p>
          <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/55">
            Prioritaskan approve/tolak di tab Antrean.
          </p>
        </div>
      )}
    </DashboardCard>
  );
}

export function AdminOverviewDashboard({
  data,
}: {
  data: OverviewData | undefined;
}) {
  if (!data?.stats) {
    return (
      <p className="text-sm text-[#5f5f5d] dark:text-surface-warm-white/70">
        Memuat…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <KpiGrid stats={data.stats} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={data} />
        </div>
        <BillingHealth stats={data.stats} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <InvoicesTable data={data} />
        <ActivityFeed data={data} />
      </div>
    </div>
  );
}
