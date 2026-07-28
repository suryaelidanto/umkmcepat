import { SupportCategory, SupportTicketStatus } from "@prisma/client";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, MessageSquare } from "lucide-react";
import { useState } from "react";

import { SensitiveText } from "@/components/admin/SensitiveText";
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
  TEKNIS: "bg-aurora-rose/10 text-aurora-rose border-aurora-rose/20",
  PEMBAYARAN: "bg-aurora-orange/10 text-aurora-orange border-aurora-orange/20",
  UMUM: "bg-aurora-gold/10 text-aurora-gold border-aurora-gold/20",
};

function AdminTicketsPage() {
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "ALL">(
    "OPEN",
  );
  const [categoryFilter, setCategoryFilter] = useState<SupportCategory | "ALL">(
    "ALL",
  );

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") {
      params.append("status", statusFilter);
    }
    if (categoryFilter !== "ALL") {
      params.append("category", categoryFilter);
    }
    const queryStr = params.toString();
    return `/api/admin/tickets${queryStr ? `?${queryStr}` : ""}`;
  };

  const ticketsQuery = useQuery({
    queryKey: ["admin", "tickets", statusFilter, categoryFilter],
    queryFn: () => fetchJson<{ tickets: AdminTicket[] }>(buildUrl()),
    refetchInterval: 15000, // Poll every 15s for new support tickets
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

  return (
    <div className="flex flex-col gap-spacing-4">
      <div className="flex flex-wrap items-center justify-between gap-spacing-3">
        <div className="flex flex-wrap gap-spacing-2">
          {/* Status Filter */}
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`rounded-radius-md px-spacing-3 py-spacing-1.5 text-xs font-semibold ${statusFilter === "ALL" ? "bg-surface-warm-white/20 text-surface-warm-white" : "bg-surface-warm-white/5 text-surface-warm-white/60 hover:bg-surface-warm-white/10"}`}
          >
            Semua
          </button>
          <button
            onClick={() => setStatusFilter("OPEN")}
            className={`rounded-radius-md px-spacing-3 py-spacing-1.5 text-xs font-semibold ${statusFilter === "OPEN" ? "bg-aurora-orange/20 text-aurora-orange" : "bg-surface-warm-white/5 text-surface-warm-white/60 hover:bg-surface-warm-white/10"}`}
          >
            Buka
          </button>
          <button
            onClick={() => setStatusFilter("RESOLVED")}
            className={`rounded-radius-md px-spacing-3 py-spacing-1.5 text-xs font-semibold ${statusFilter === "RESOLVED" ? "bg-surface-warm-white/15 text-surface-warm-white/80" : "bg-surface-warm-white/5 text-surface-warm-white/60 hover:bg-surface-warm-white/10"}`}
          >
            Selesai
          </button>
        </div>

        <div className="flex flex-wrap gap-spacing-2">
          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as SupportCategory | "ALL")
            }
            className="h-8 rounded-radius-md border border-surface-warm-white/10 bg-[#171715] px-spacing-2.5 text-xs text-surface-warm-white/80 outline-none focus:ring-1 focus:ring-aurora-orange"
          >
            <option value="ALL">Semua Kategori</option>
            {Object.keys(CATEGORY_LABELS).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat as SupportCategory]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {ticketsQuery.isLoading ? (
        <div className="flex justify-center py-spacing-12">
          <Loader2 className="size-6 animate-spin text-surface-warm-white/60" />
        </div>
      ) : ticketsQuery.data?.tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-radius-lg border border-dashed border-surface-warm-white/10 py-spacing-12 text-center text-surface-warm-white/40">
          <MessageSquare className="size-8 opacity-40" />
          <p className="mt-spacing-3 text-sm">
            Tidak ada tiket bantuan yang ditemukan.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-spacing-3">
          {ticketsQuery.data?.tickets.map((ticket) => {
            const lastMsg = ticket.messages[0];
            const shortId = ticket.id.slice(-8).toUpperCase();
            const needsReply =
              ticket.status === "OPEN" &&
              lastMsg &&
              lastMsg.authorRole === "user";

            return (
              <a
                key={ticket.id}
                href={`/admin/tickets/${ticket.id}`}
                className={`relative flex flex-col gap-spacing-2 rounded-radius-md border p-spacing-4 transition ${needsReply ? "border-aurora-orange/30 bg-aurora-orange/5 hover:bg-aurora-orange/8" : "border-surface-warm-white/10 bg-surface-warm-white/5 hover:bg-surface-warm-white/8"}`}
              >
                {needsReply && (
                  <span
                    className="absolute left-2 top-2 flex h-2 w-2 rounded-full bg-aurora-orange"
                    title="Menunggu balasan"
                  />
                )}

                <div className="flex items-start justify-between gap-spacing-3 pl-spacing-2">
                  <div className="flex items-center gap-spacing-2">
                    <span className="text-xs font-mono text-surface-warm-white/40">
                      #{shortId}
                    </span>
                    <span
                      className={`rounded-radius-sm border px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_COLORS[ticket.category]}`}
                    >
                      {CATEGORY_LABELS[ticket.category]}
                    </span>
                  </div>
                  <span className="text-[10px] text-surface-warm-white/40">
                    {formatTimeAgo(ticket.updatedAt)}
                  </span>
                </div>

                <div className="pl-spacing-2">
                  <h3 className="font-semibold text-sm line-clamp-1">
                    {ticket.subject}
                  </h3>
                  <div className="mt-1 text-xs text-surface-warm-white/60">
                    Pengguna:{" "}
                    <SensitiveText
                      value={ticket.user.email}
                      kind="email"
                      className="font-mono text-xs"
                    />
                  </div>
                  {lastMsg && (
                    <p className="mt-spacing-2 text-xs text-surface-warm-white/50 line-clamp-1 italic">
                      {lastMsg.authorRole === "user" ? "User: " : "Admin: "} "
                      {lastMsg.body}"
                    </p>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
