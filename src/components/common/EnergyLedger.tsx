"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Folder, Zap } from "lucide-react";
import { useState } from "react";

import { useSession } from "@/lib/auth/auth-client";
import { fetchJson, queryKeys } from "@/lib/query-client";

export type EnergyLedgerEntry = {
  id: string;
  createdAt: string;
  reason: string;
  inputTokens: number;
  outputTokens: number;
  amount: number;
  projectId: string | null;
  projectTitle?: string | null;
  modelId?: string | null;
};

type EnergyLedgerResponse = {
  entries: EnergyLedgerEntry[];
};

type ReasonDetail = {
  label: string;
  description: string;
};

const REASON_DETAILS: Record<string, ReasonDetail> = {
  "build:step": {
    label: "Pembuatan Kode Website",
    description: "AI menyusun komponen tampilan, tema, dan halaman website.",
  },
  "build:subagent": {
    label: "Penyusunan Desain AI",
    description: "Analisis layout dan penataan elemen visual situs.",
  },
  "build:spec": {
    label: "Perancangan Arsitektur",
    description: "Menyusun struktur brief dan spesifikasi website.",
  },
  "build:repair": {
    label: "Penyempurnaan Visual & Kontras",
    description:
      "Memperbaiki kerapian warna dan tombol sesuai standar aksesibilitas.",
  },
  "discuss:step": {
    label: "Percakapan & Analisis Brief",
    description: "AI merespons chat dan menyiapkan pertanyaan kebutuhan toko.",
  },
  "discuss:repair": {
    label: "Penataan Opsi Jawaban",
    description: "Menyusun ulang tombol pilihan agar pas dengan jawabanmu.",
  },
  "edit:step": {
    label: "Pembaruan Halaman",
    description: "Menerapkan instruksi perubahan teks atau tata letak.",
  },
  moderation: {
    label: "Pemeriksaan Keamanan",
    description: "Verifikasi keamanan teks dan gambar sebelum diproses.",
  },
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

function getReasonInfo(reason: string): ReasonDetail {
  return (
    REASON_DETAILS[reason] ?? {
      label: reason,
      description: "Operasi AI sistem.",
    }
  );
}

export function EnergyLedger({
  projectId,
  limit = 50,
  entries,
}: {
  projectId?: string;
  limit?: number;
  entries?: EnergyLedgerEntry[];
}) {
  const { data: session, status } = useSession();
  const hasUser = Boolean(session?.user) && status !== "loading";
  const [scope, setScope] = useState<"project" | "all">(
    projectId ? "project" : "all",
  );

  const activeProjectId = scope === "project" ? projectId : undefined;

  const query = useQuery({
    queryKey: activeProjectId
      ? [...queryKeys.energy, "ledger", activeProjectId]
      : [...queryKeys.energy, "ledger"],
    queryFn: () =>
      fetchJson<EnergyLedgerResponse>(
        `/api/user/energy-ledger?limit=${limit}${activeProjectId ? `&projectId=${activeProjectId}` : ""}`,
        { cache: "no-store" },
      ),
    enabled: hasUser && entries === undefined,
  });

  if (entries === undefined && !hasUser) {
    return null;
  }

  const resolvedEntries = entries ?? query.data?.entries ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Scope Filter Tabs */}
      {projectId && entries === undefined ? (
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <button
            type="button"
            onClick={() => setScope("project")}
            className={`cursor-pointer rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
              scope === "project"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Proyek Ini
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`cursor-pointer rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
              scope === "all"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Semua Proyek
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
        {entries === undefined && query.isPending && !query.data ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <div className="size-2 animate-pulse rounded-full bg-primary" />
            <span>Memuat catatan energi…</span>
          </div>
        ) : null}

        {entries === undefined && query.isError ? (
          <p className="py-6 text-center text-xs text-destructive" role="alert">
            Gagal memuat catatan energi.
          </p>
        ) : null}

        {!query.isPending && resolvedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Zap className="mb-2 size-8 opacity-30 text-amber-500" />
            <p className="text-xs">Belum ada catatan pemakaian energi.</p>
          </div>
        ) : null}

        <ol className="flex flex-col gap-3">
          {resolvedEntries.map((entry) => {
            const info = getReasonInfo(entry.reason);

            return (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-foreground/20 hover:bg-muted/30 dark:border-white/[0.08] dark:bg-[#1a1a18] dark:hover:bg-[#20201d]"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold tracking-tight text-foreground dark:text-surface-warm-white">
                      {info.label}
                    </span>

                    {/* Clickable Project Badge */}
                    {scope === "all" && entry.projectId ? (
                      <a
                        href={`/projects/${entry.projectId}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                        title="Buka proyek ini"
                      >
                        <Folder className="size-2.5" />
                        <span className="max-w-[140px] truncate">
                          {entry.projectTitle || "Proyek"}
                        </span>
                        <ArrowUpRight className="size-2.5 opacity-60" />
                      </a>
                    ) : null}
                  </div>

                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {info.description}
                  </p>

                  <span className="text-[10px] text-muted-foreground/80 dark:text-surface-warm-white/50">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>

                {/* Energy amount debit */}
                <div className="flex shrink-0 flex-col items-end pl-2">
                  <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                    {formatNumber(entry.amount)}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Energi
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
