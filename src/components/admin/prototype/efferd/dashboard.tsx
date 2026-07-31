"use client";

// PROTOTYPE — Efferd dashboard-2 structure, wired to real /api/admin/overview.
// Throwaway. Streamer-safe via SensitiveText.

import {
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Users,
  FolderKanban,
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

import { type AdminVariant, withVariant } from "../types";
import { DashboardCard } from "./dashboard-card";

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

/** Synthetic sparkline from revenue + payment count (no history API). */
function sparkFrom(stats: OverviewData["stats"]) {
  const base = Math.max(stats.revenueThisMonth, 1);
  return [0.55, 0.62, 0.58, 0.7, 0.68, 0.82, 1].map((f, i) => ({
    day: `H${i + 1}`,
    value: Math.round(base * f),
    payments: Math.max(1, Math.round(stats.paymentsThisMonth * f * 0.2)),
  }));
}

function KpiGrid({
  stats,
  dense,
}: {
  stats: OverviewData["stats"];
  dense?: boolean;
}) {
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
    <div
      className={
        dense
          ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
          : "grid grid-cols-2 gap-3 sm:grid-cols-3"
      }
    >
      {items.map((s) => {
        const Icon = s.icon;
        return (
          <DashboardCard key={s.label} className="p-3">
            <div className="flex items-center justify-between text-xs text-surface-warm-white/55">
              <span>{s.label}</span>
              <Icon className="size-3.5 opacity-60" />
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums">{s.value}</p>
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
        <p className="text-xs tracking-wide text-surface-warm-white/55">
          Pendapatan (ilustrasi)
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatRupiah(data.stats.revenueThisMonth)}
        </p>
        <p className="text-[11px] text-surface-warm-white/45">
          Sparkline sintetis — bukan histori real. Ganti saat API trend ada.
        </p>
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid
              stroke="rgba(252,251,248,0.08)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tick={{ fill: "rgba(252,251,248,0.45)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "#1c1c1a",
                border: "1px solid rgba(252,251,248,0.12)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v) => formatRupiah(Number(v))}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#fcfbf8"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  );
}

function InvoicesTable({
  data,
  variant,
}: {
  data: OverviewData;
  variant: AdminVariant;
}) {
  const streamerMode = useStreamerMode();
  const rows = data.recentTransactions;
  return (
    <DashboardCard>
      <div className="flex items-center justify-between border-b border-surface-warm-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Transaksi terbaru</p>
          <p className="text-xs text-surface-warm-white/50">
            Order · status · jumlah
          </p>
        </div>
        <Link
          className="text-xs text-surface-warm-white/70 underline-offset-2 hover:underline"
          href={withVariant("/admin/transactions", variant)}
        >
          Semua
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-surface-warm-white/55">
          Belum ada transaksi.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-warm-white/10 text-xs text-surface-warm-white/50">
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  className="border-b border-surface-warm-white/8"
                  key={t.orderId}
                >
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {streamerMode ? (
                      <SensitiveText kind="orderId" value={t.orderId} />
                    ) : (
                      t.orderId
                    )}
                  </td>
                  <td className="px-4 py-2.5">{t.status}</td>
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

function ActivityFeed({
  data,
  variant,
}: {
  data: OverviewData;
  variant: AdminVariant;
}) {
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
      <div className="border-b border-surface-warm-white/10 px-4 py-3">
        <p className="text-sm font-medium">Aktivitas</p>
        <p className="text-xs text-surface-warm-white/50">
          Antrean + transaksi
        </p>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-surface-warm-white/55">
          <CheckCircle2 className="size-6 opacity-50" />
          Tidak ada aktivitas terbaru.
        </div>
      ) : (
        <ul className="divide-y divide-surface-warm-white/8">
          {items.map((item) => (
            <li
              className="flex items-start gap-3 px-4 py-3 text-sm"
              key={`${item.kind}-${item.id}`}
            >
              <span className="mt-0.5 text-surface-warm-white/40">
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
                <p className="text-xs text-surface-warm-white/50">
                  {item.kind === "waitlist" ? "Antrean" : "Transaksi"}
                  {"status" in item && item.status
                    ? ` · ${item.status}`
                    : ""} · {new Date(item.time).toLocaleDateString("id-ID")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-surface-warm-white/10 px-4 py-2">
        <Link
          className="text-xs text-surface-warm-white/70 underline-offset-2 hover:underline"
          href={withVariant("/admin/waitlist", variant)}
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
      <p className="text-xs tracking-wide text-surface-warm-white/55">
        Kesehatan ops
      </p>
      {ok ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm font-medium">Tidak ada antrean menunggu.</p>
          <p className="text-xs text-surface-warm-white/55">
            {stats.paymentsThisMonth} pembayaran selesai bulan ini ·{" "}
            {stats.projects} proyek.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm font-medium">
            {stats.waitlistPending} antrean perlu review
          </p>
          <p className="text-xs text-surface-warm-white/55">
            Prioritaskan approve/tolak di tab Antrean.
          </p>
        </div>
      )}
    </DashboardCard>
  );
}

/** B — dense KPI grid (Efferd dashboard-2) */
function DashboardB({
  data,
  variant,
}: {
  data: OverviewData;
  variant: AdminVariant;
}) {
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid dense stats={data.stats} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={data} />
        </div>
        <BillingHealth stats={data.stats} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <InvoicesTable data={data} variant={variant} />
        <ActivityFeed data={data} variant={variant} />
      </div>
    </div>
  );
}

/** C — sidebar shell companion: simpler two-column */
function DashboardC({
  data,
  variant,
}: {
  data: OverviewData;
  variant: AdminVariant;
}) {
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid stats={data.stats} />
      <div className="grid gap-4 md:grid-cols-2">
        <ActivityFeed data={data} variant={variant} />
        <InvoicesTable data={data} variant={variant} />
      </div>
    </div>
  );
}

/** D — chart-first */
function DashboardD({
  data,
  variant,
}: {
  data: OverviewData;
  variant: AdminVariant;
}) {
  return (
    <div className="flex flex-col gap-4">
      <RevenueChart data={data} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Pengguna", String(data.stats.users)],
          ["Antrean", String(data.stats.waitlistPending)],
          ["Proyek", String(data.stats.projects)],
          ["Bayar", String(data.stats.paymentsThisMonth)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="border-l border-surface-warm-white/15 pl-3"
          >
            <p className="text-[11px] text-surface-warm-white/50">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <InvoicesTable data={data} variant={variant} />
    </div>
  );
}

/** E — ops command: attention first */
function DashboardE({
  data,
  variant,
}: {
  data: OverviewData;
  variant: AdminVariant;
}) {
  const streamerMode = useStreamerMode();
  return (
    <div className="flex flex-col gap-3">
      <DashboardCard className="border-surface-warm-white/25 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-warm-white/50">
          Butuh tindakan
        </p>
        <p className="mt-1 text-sm">
          <span className="font-semibold">{data.stats.waitlistPending}</span>{" "}
          antrean · {data.stats.paymentsThisMonth} bayar bln ini ·{" "}
          {data.stats.users} pengguna
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Link
            className="rounded-radius-md border border-surface-warm-white/20 px-2 py-1 hover:bg-surface-warm-white/8"
            href={withVariant("/admin/waitlist", variant)}
          >
            Review antrean
          </Link>
          <Link
            className="rounded-radius-md border border-surface-warm-white/20 px-2 py-1 hover:bg-surface-warm-white/8"
            href={withVariant("/admin/transactions", variant)}
          >
            Cek transaksi
          </Link>
          <Link
            className="rounded-radius-md border border-surface-warm-white/20 px-2 py-1 hover:bg-surface-warm-white/8"
            href={withVariant("/admin/tickets", variant)}
          >
            Tiket
          </Link>
        </div>
      </DashboardCard>
      <ul className="divide-y divide-surface-warm-white/10 border border-surface-warm-white/12">
        {data.recentWaitlist.slice(0, 5).map((e) => (
          <li className="flex justify-between gap-2 px-3 py-2" key={e.id}>
            <span>
              {streamerMode ? (
                <SensitiveText kind="name" value={e.businessName} />
              ) : (
                e.businessName
              )}
            </span>
            <span className="text-surface-warm-white/50">
              {new Date(e.submittedAt).toLocaleDateString("id-ID")}
            </span>
          </li>
        ))}
      </ul>
      <InvoicesTable data={data} variant={variant} />
    </div>
  );
}

export function EfferdDashboard({
  variant,
  data,
}: {
  variant: Exclude<AdminVariant, "A">;
  data: OverviewData | undefined;
}) {
  if (!data?.stats) {
    return <p className="text-sm text-surface-warm-white/70">Memuat…</p>;
  }
  if (variant === "B") {
    return <DashboardB data={data} variant={variant} />;
  }
  if (variant === "C") {
    return <DashboardC data={data} variant={variant} />;
  }
  if (variant === "D") {
    return <DashboardD data={data} variant={variant} />;
  }
  return <DashboardE data={data} variant={variant} />;
}
