import { SupportCategory, SupportTicketStatus } from "@prisma/client";
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { Loader2, MessageSquare } from "lucide-react";
import { useState } from "react";

import { AdminSearchInput } from "@/components/admin/AdminSearchInput";
import { ticketStatusDisplay } from "@/components/admin/status/admin-status";
import { AdminStatusBadge } from "@/components/admin/status/AdminStatusBadge";
import { AdminStatusFilter } from "@/components/admin/status/AdminStatusFilter";
import { SensitiveText } from "@/components/admin/streamer-mode/SensitiveText";
import { Link } from "@/components/ui/link";
import { fetchJson } from "@/lib/query-client";

export const Route = createFileRoute("/_main/admin/tickets")({
  component: AdminTicketsPage,
});

type AdminTicket = {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
  };
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorRole: string;
  }>;
};

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  TEKNIS: "Teknis",
  PEMBAYARAN: "Pembayaran",
  UMUM: "Umum",
};

const CATEGORY_COLORS: Record<SupportCategory, string> = {
  TEKNIS: "bg-accent-rose-subtle text-accent-rose border-accent-rose-border",
  PEMBAYARAN:
    "bg-accent-orange-subtle text-accent-orange border-accent-orange-border",
  UMUM: "bg-accent-gold-subtle text-accent-gold border-accent-gold-border",
};

const TICKET_STATUS_OPTIONS = [
  { value: "OPEN", label: "Buka" },
  { value: "RESOLVED", label: "Selesai" },
  { value: "ALL", label: "Semua" },
] as const;

function AdminTicketsPage() {
  // Default work queue: open tickets.
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "ALL">(
    "OPEN",
  );
  const [selectedCategories, setSelectedCategories] = useState<
    SupportCategory[]
  >([]);
  const [q, setQ] = useState("");
  const { pathname } = useRouterState({ select: (s) => s.location });
  const isTicketThread =
    pathname !== "/admin/tickets" && pathname.startsWith("/admin/tickets/");

  const toggleCategory = (cat: SupportCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") {
      params.append("status", statusFilter);
    }
    if (selectedCategories.length > 0) {
      params.append("category", selectedCategories.join(","));
    }
    if (q.trim()) {
      params.append("q", q.trim());
    }
    const queryStr = params.toString();
    return `/api/admin/tickets${queryStr ? `?${queryStr}` : ""}`;
  };

  const ticketsQuery = useQuery({
    queryKey: ["admin", "tickets", statusFilter, selectedCategories, q],
    queryFn: () => fetchJson<{ tickets: AdminTicket[] }>(buildUrl()),
    refetchInterval: 15000,
  });

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) {
      return "Baru saja";
    }
    if (diffMins < 60) {
      return `${diffMins} menit lalu`;
    }
    if (diffHours < 24) {
      return `${diffHours} jam lalu`;
    }
    return `${diffDays} hari lalu`;
  };

  if (isTicketThread) {
    return <Outlet />;
  }

  return (
    <div className="flex flex-col gap-spacing-4">
      <div className="flex flex-col gap-spacing-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <AdminStatusFilter
          onChange={(v) => setStatusFilter(v as SupportTicketStatus | "ALL")}
          options={TICKET_STATUS_OPTIONS}
          value={statusFilter}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[#5f5f5d] dark:text-surface-warm-white/50 mr-1 hidden sm:inline">
            Kategori:
          </span>
          {(Object.keys(CATEGORY_LABELS) as SupportCategory[]).map((cat) => {
            const isSelected = selectedCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  isSelected
                    ? "border-accent-orange bg-accent-orange text-white shadow-2xs"
                    : "border-black/10 bg-white text-[#5f5f5d] hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.04] dark:text-surface-warm-white/70 dark:hover:bg-white/10"
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            );
          })}
          {selectedCategories.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedCategories([])}
              className="text-[11px] text-[#5f5f5d] hover:text-[#1c1c1c] dark:text-surface-warm-white/50 dark:hover:text-surface-warm-white underline ml-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <AdminSearchInput
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari subjek tiket, email, atau nama pengguna…"
        value={q}
      />

      {ticketsQuery.isLoading ? (
        <div className="flex justify-center py-spacing-12">
          <Loader2 className="size-6 animate-spin text-[#5f5f5d] dark:text-surface-warm-white/60" />
        </div>
      ) : ticketsQuery.data?.tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-radius-lg border border-dashed border-black/10 py-spacing-12 text-center text-[#5f5f5d] dark:border-surface-warm-white/10 dark:text-surface-warm-white/40">
          <MessageSquare className="size-8 opacity-40" />
          <p className="mt-spacing-3 text-sm">
            Tidak ada tiket bantuan yang ditemukan.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-spacing-3">
          <div className="flex items-center justify-between px-1 text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
            <span>
              Menampilkan {ticketsQuery.data?.tickets.length ?? 0} tiket
            </span>
          </div>
          {ticketsQuery.data?.tickets.map((ticket) => {
            const lastMsg = ticket.messages[0];
            const shortId = ticket.id.slice(-8).toUpperCase();
            const needsReply =
              ticket.status === "OPEN" &&
              lastMsg &&
              lastMsg.authorRole === "user";

            return (
              <Link
                key={ticket.id}
                href={`/admin/tickets/${ticket.id}`}
                className={`relative flex flex-col gap-spacing-2 rounded-radius-md border p-spacing-4 transition ${needsReply ? "border-accent-orange-border bg-accent-orange-subtle text-[#1c1c1c] dark:text-surface-warm-white" : "border-black/10 bg-[#fcfbf8] text-[#1c1c1c] hover:border-black/20 hover:bg-black/[0.02] dark:border-surface-warm-white/10 dark:bg-surface-warm-white/5 dark:text-surface-warm-white dark:hover:bg-surface-warm-white/8"}`}
              >
                {needsReply && (
                  <span
                    className="absolute left-2 top-2 flex h-2 w-2 rounded-full bg-accent-orange"
                    title="Menunggu balasan"
                  />
                )}

                <div className="flex items-start justify-between gap-spacing-3 pl-spacing-2">
                  <div className="flex items-center gap-spacing-2">
                    <span className="text-xs font-mono text-[#5f5f5d] dark:text-surface-warm-white/40">
                      #{shortId}
                    </span>
                    <span
                      className={`rounded-radius-sm border px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_COLORS[ticket.category]}`}
                    >
                      {CATEGORY_LABELS[ticket.category]}
                    </span>
                    {(() => {
                      const display = ticketStatusDisplay(ticket.status);
                      return (
                        <AdminStatusBadge tone={display.tone}>
                          {display.label}
                        </AdminStatusBadge>
                      );
                    })()}
                  </div>
                  <span className="text-[10px] text-[#5f5f5d] dark:text-surface-warm-white/40">
                    {formatTimeAgo(ticket.updatedAt)}
                  </span>
                </div>

                <div className="pl-spacing-2">
                  <h3 className="font-semibold text-sm line-clamp-1 text-[#1c1c1c] dark:text-surface-warm-white">
                    {ticket.subject}
                  </h3>
                  <div className="mt-1 text-xs text-[#5f5f5d] dark:text-surface-warm-white/60">
                    Pengguna:{" "}
                    <SensitiveText
                      value={ticket.user.email}
                      kind="email"
                      className="font-mono text-xs"
                    />
                  </div>
                  {lastMsg && (
                    <p className="mt-spacing-2 text-xs text-[#5f5f5d] dark:text-surface-warm-white/50 line-clamp-1 italic">
                      {lastMsg.authorRole === "user" ? "User: " : "Admin: "} "
                      {lastMsg.body}"
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
