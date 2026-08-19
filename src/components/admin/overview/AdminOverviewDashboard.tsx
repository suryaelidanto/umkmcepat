"use client";

import {
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FolderKanban,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DashboardCard } from "@/components/admin/DashboardCard";
import {
  paymentStatusDisplay,
  waitlistStatusDisplay,
} from "@/components/admin/status/admin-status";
import { AdminStatusBadge } from "@/components/admin/status/AdminStatusBadge";
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { useStreamerMode } from "@/components/admin/streamer-mode/streamer-mode-context";
import { Link } from "@/components/ui/link";

export type DailyTrendPoint = {
  date: string;
  revenue: number;
  signups: number;
};

export type OverviewData = {
  stats: {
    users: number;
    waitlistPending: number;
    projectsReady: number;
    ticketsOpen: number;
    revenueThisMonth: number;
  };
  trend7Days: DailyTrendPoint[];
  recentWaitlist: {
    id: string;
    businessName: string;
    businessType?: string | null;
    status: string;
    submittedAt: string;
  }[];
  recentTransactions: {
    id: string;
    orderId: string;
    status: string;
    amount: number;
    createdAt: string;
    user?: {
      email: string | null;
      name: string | null;
    } | null;
  }[];
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function KpiGrid({ stats }: { stats: OverviewData["stats"] }) {
  const items = [
    {
      label: "Total Pengguna",
      value: String(stats.users),
      icon: Users,
      href: "/admin/users",
    },
    {
      label: "Antrean Menunggu",
      value: String(stats.waitlistPending),
      icon: ClipboardList,
      href: "/admin/waitlist",
      highlight: stats.waitlistPending > 0,
    },
    {
      label: "Proyek Siap",
      value: String(stats.projectsReady),
      icon: FolderKanban,
      href: "/admin/projects",
    },
    {
      label: "Tiket Terbuka",
      value: String(stats.ticketsOpen),
      icon: MessageSquare,
      href: "/admin/tickets",
      highlight: stats.ticketsOpen > 0,
    },
    {
      label: "Pendapatan Bulan Ini",
      value: formatRupiah(stats.revenueThisMonth),
      icon: CreditCard,
      href: "/admin/transactions",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((s) => {
        const Icon = s.icon;
        return (
          <Link
            href={s.href}
            key={s.label}
            className="group block focus-visible:outline-none"
          >
            <DashboardCard className="p-4 transition-all group-hover:border-black/20 group-hover:bg-black/[0.02] dark:group-hover:border-surface-warm-white/20 dark:group-hover:bg-white/[0.02]">
              <div className="flex items-center justify-between text-xs font-medium text-[#5f5f5d] dark:text-surface-warm-white/60">
                <span>{s.label}</span>
                <Icon
                  className={`size-4 opacity-70 transition-transform group-hover:scale-110 ${
                    s.highlight ? "text-accent-orange opacity-100" : ""
                  }`}
                />
              </div>
              <p
                className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${
                  s.highlight
                    ? "text-accent-orange"
                    : "text-[#1c1c1c] dark:text-surface-warm-white"
                }`}
              >
                {s.value}
              </p>
            </DashboardCard>
          </Link>
        );
      })}
    </div>
  );
}

function RevenueAndGrowthChart({ data }: { data: OverviewData }) {
  const points = data.trend7Days || [];
  const total7DayRevenue = points.reduce((acc, p) => acc + p.revenue, 0);
  const total7DaySignups = points.reduce((acc, p) => acc + p.signups, 0);

  return (
    <DashboardCard className="flex flex-col p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-black/10 pb-3 dark:border-surface-warm-white/10">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-accent-orange" />
            <h2 className="text-sm font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
              Tren 7 Hari Terakhir
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
            Performa pendapatan dan pendaftaran baru dari data nyata.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-accent-orange" />
            <span className="text-[#5f5f5d] dark:text-surface-warm-white/60">
              Pendapatan:
            </span>
            <span className="font-bold tabular-nums text-[#1c1c1c] dark:text-surface-warm-white">
              {formatRupiah(total7DayRevenue)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-blue-500" />
            <span className="text-[#5f5f5d] dark:text-surface-warm-white/60">
              Pengguna Baru:
            </span>
            <span className="font-bold tabular-nums text-[#1c1c1c] dark:text-surface-warm-white">
              {total7DaySignups}
            </span>
          </div>
        </div>
      </div>

      <div className="h-56 w-full pt-1">
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart data={points}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorSignups" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="rgba(128,128,128,0.12)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="date"
              tick={{ fill: "currentColor", fontSize: 11, opacity: 0.6 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="rev"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "currentColor", fontSize: 10, opacity: 0.5 }}
              tickFormatter={(v) =>
                `Rp${Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : v}`
              }
              width={50}
            />
            <YAxis
              yAxisId="signups"
              orientation="right"
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              tick={{ fill: "currentColor", fontSize: 10, opacity: 0.5 }}
              width={24}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--tooltip-bg, #1c1c1a)",
                borderColor: "rgba(128,128,128,0.2)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--tooltip-fg, #eceae4)",
              }}
              formatter={(val, name) => {
                if (name === "revenue") {
                  return [formatRupiah(Number(val)), "Pendapatan"];
                }
                return [`${val} orang`, "Pendaftaran"];
              }}
            />
            <Area
              yAxisId="rev"
              type="monotone"
              dataKey="revenue"
              stroke="#f97316"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRevenue)"
            />
            <Area
              yAxisId="signups"
              type="monotone"
              dataKey="signups"
              stroke="#3b82f6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorSignups)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  );
}

function InvoicesTable({ data }: { data: OverviewData }) {
  const streamerMode = useStreamerMode();
  const rows = data.recentTransactions;

  return (
    <DashboardCard className="flex flex-col">
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-surface-warm-white/10">
        <div>
          <h2 className="text-sm font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
            Transaksi Booster Terbaru
          </h2>
          <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
            Riwayat pesanan energi Mayar
          </p>
        </div>
        <Link
          className="text-xs font-semibold text-accent-orange underline-offset-2 hover:underline"
          href="/admin/transactions"
        >
          Lihat Semua
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
          <CreditCard className="size-8 opacity-40 mb-2" />
          Belum ada transaksi booster.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs text-[#5f5f5d] dark:border-surface-warm-white/10 dark:text-surface-warm-white/50">
                <th className="px-4 py-2.5 font-medium">Order ID</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Nominal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-surface-warm-white/5">
              {rows.map((t) => {
                const display = paymentStatusDisplay(t.status);
                return (
                  <tr
                    className="transition hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                    key={t.id}
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-mono text-xs font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
                        {streamerMode ? (
                          <SensitiveText kind="orderId" value={t.orderId} />
                        ) : (
                          t.orderId
                        )}
                      </p>
                      <p className="text-[11px] text-[#5f5f5d] dark:text-surface-warm-white/50">
                        {new Date(t.createdAt).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminStatusBadge tone={display.tone}>
                        {display.label}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-[#1c1c1c] dark:text-surface-warm-white">
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  );
}

function WaitlistFeed({ data }: { data: OverviewData }) {
  const streamerMode = useStreamerMode();
  const items = data.recentWaitlist;

  return (
    <DashboardCard className="flex flex-col">
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-surface-warm-white/10">
        <div>
          <h2 className="text-sm font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
            Pendaftar Antrean Terbaru
          </h2>
          <p className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
            Aplikasi UMKM masuk
          </p>
        </div>
        <Link
          className="text-xs font-semibold text-accent-orange underline-offset-2 hover:underline"
          href="/admin/waitlist"
        >
          Kelola Antrean
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
          <CheckCircle2 className="size-8 opacity-40 mb-2" />
          Tidak ada antrean pendaftar.
        </div>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-surface-warm-white/5">
          {items.map((item) => {
            const display = waitlistStatusDisplay(item.status);
            return (
              <li
                className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                key={item.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-sm text-[#1c1c1c] dark:text-surface-warm-white">
                      {streamerMode ? (
                        <SensitiveText kind="name" value={item.businessName} />
                      ) : (
                        item.businessName
                      )}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-[#5f5f5d] dark:text-surface-warm-white/50">
                    {item.businessType ? `${item.businessType} • ` : ""}
                    {new Date(item.submittedAt).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <AdminStatusBadge tone={display.tone}>
                  {display.label}
                </AdminStatusBadge>
              </li>
            );
          })}
        </ul>
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
      <div className="flex h-64 items-center justify-center text-sm text-[#5f5f5d] dark:text-surface-warm-white/60">
        Memuat dashboard ringkasan…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 5 Real KPIs */}
      <KpiGrid stats={data.stats} />

      {/* 7-Day Real Performance Trend Chart */}
      <RevenueAndGrowthChart data={data} />

      {/* 2 Focused Business Tables */}
      <div className="grid gap-5 lg:grid-cols-2">
        <InvoicesTable data={data} />
        <WaitlistFeed data={data} />
      </div>
    </div>
  );
}
