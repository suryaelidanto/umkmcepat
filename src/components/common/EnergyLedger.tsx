"use client";

import { useQuery } from "@tanstack/react-query";

import { useSession } from "@/lib/auth-client";
import { fetchJson, queryKeys } from "@/lib/query-client";

export type EnergyLedgerEntry = {
  id: string;
  createdAt: string;
  reason: string;
  inputTokens: number;
  outputTokens: number;
  amount: number;
  projectId: string | null;
};

type EnergyLedgerResponse = {
  entries: EnergyLedgerEntry[];
};

const REASON_LABEL: Record<string, string> = {
  "build:step": "Langkah build",
  "build:subagent": "Riset sub-agen",
  "build:spec": "Spesifikasi build",
  "build:repair": "Perbaikan build",
  "discuss:step": "Langkah diskusi",
  "discuss:repair": "Perbaikan kartu",
  "edit:step": "Langkah edit",
  moderation: "Moderasi",
};

const numberFormatter = new Intl.NumberFormat("id-ID");
const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

export function EnergyLedger({
  projectId,
  limit = 50,
  entries,
}: {
  projectId?: string;
  limit?: number;
  // Used to render static data (stories, tests). When provided, no fetch runs.
  entries?: EnergyLedgerEntry[];
}) {
  const { data: session, status } = useSession();
  const hasUser = Boolean(session?.user) && status !== "loading";

  const query = useQuery({
    queryKey: projectId
      ? [...queryKeys.energy, "ledger", projectId]
      : [...queryKeys.energy, "ledger"],
    queryFn: () =>
      fetchJson<EnergyLedgerResponse>(
        `/api/user/energy-ledger?limit=${limit}${projectId ? `&projectId=${projectId}` : ""}`,
        { cache: "no-store" },
      ),
    enabled: hasUser && entries === undefined,
  });

  if (entries === undefined && !hasUser) {
    return null;
  }

  if (entries === undefined && query.isPending && !query.data) {
    return (
      <div className="flex items-center gap-spacing-2 text-body-small text-surface-warm-white/55">
        <div className="size-2 animate-pulse rounded-full bg-surface-warm-white/30" />
        <span>Memuat catatan energi…</span>
      </div>
    );
  }

  if (entries === undefined && query.isError) {
    return (
      <p className="text-body-small text-destructive" role="alert">
        Gagal memuat catatan energi.
      </p>
    );
  }

  const resolvedEntries = entries ?? query.data?.entries ?? [];

  if (resolvedEntries.length === 0) {
    return (
      <p className="text-body-small text-surface-warm-white/55">
        Belum ada catatan pemakaian energi.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-spacing-2">
      {resolvedEntries.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center justify-between gap-spacing-4 rounded-radius-md border border-white/[0.08] bg-white/[0.03] px-spacing-6 py-spacing-5"
        >
          <div className="flex min-w-0 flex-col gap-spacing-1">
            <span className="text-body-small font-medium text-surface-warm-white">
              {reasonLabel(entry.reason)}
            </span>
            <span className="text-body-small text-surface-warm-white/55">
              {formatDateTime(entry.createdAt)} ·{" "}
              {formatNumber(entry.inputTokens)}/
              {formatNumber(entry.outputTokens)} token
            </span>
          </div>
          <span className="text-body-small font-medium text-surface-warm-white tabular-nums">
            −{formatNumber(Math.abs(entry.amount))}
          </span>
        </li>
      ))}
    </ol>
  );
}
